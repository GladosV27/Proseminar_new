package de.tudortmund.noesis

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.StatFs
import android.system.Os
import android.util.Log
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.ExperimentalApi
import com.google.ai.edge.litertlm.ExperimentalFlags
import com.google.ai.edge.litertlm.LogSeverity
import com.google.ai.edge.litertlm.Message
import com.google.ai.edge.litertlm.SamplerConfig
import java.io.File
import java.io.FileInputStream
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

object NativeLlmManager {
    private const val TAG = "NoesisNativeLlm"
    private const val RUNTIME_VERSION = "0.14.0"
    private const val DOWNLOAD_BUFFER_BYTES = 1024 * 1024
    private const val DOWNLOAD_EVENT_INTERVAL_MS = 250L
    private const val DOWNLOAD_STORAGE_MARGIN_BYTES = 256L * 1024L * 1024L
    private const val MAX_REDIRECTS = 8
    private const val GENERATION_TIMEOUT_MS = 10L * 60L * 1000L
    // LiteRT-LM 0.14 exposes no per-turn decode-token cap. Five output
    // characters per requested token are a conservative German-text guard:
    // long enough for complete short answers, materially faster than the old
    // 8x approximation.
    private const val CHARS_PER_REQUESTED_TOKEN_GUARD = 5

    interface EventSink {
        fun onDownloadProgress(modelId: String, loaded: Long, total: Long, pct: Double, text: String)
        fun onToken(requestId: String, delta: String, text: String)
    }

    data class DeviceCapabilities(
        val native: Boolean,
        val runtime: String,
        val backend: String,
        val avoidsVulkan: Boolean,
        val apiLevel: Int,
        val abis: List<String>,
        val totalRamMb: Long,
        val availableRamMb: Long,
        val freeStorageBytes: Long,
        val cpuCores: Int,
        val cpuThreads: Int,
        val supported: Boolean,
        val reason: String,
        val recommendedModelId: String,
    )

    data class ModelStatus(
        val modelId: String,
        val state: String,
        val loaded: Long,
        val total: Long,
        val pct: Double,
        val path: String?,
        val error: String?,
    )

    data class DownloadStart(
        val modelId: String,
        val started: Boolean,
        val state: String,
    )

    private data class ActiveGeneration(
        val requestId: String,
        val conversation: Conversation,
        val interrupted: AtomicBoolean = AtomicBoolean(false),
        val hardLimitReached: AtomicBoolean = AtomicBoolean(false),
    )

    private val processScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val downloadJobs = ConcurrentHashMap<String, Job>()
    private val downloadErrors = ConcurrentHashMap<String, String>()
    private val engineMutex = Mutex()

    @Volatile
    private var eventSink: EventSink? = null

    @Volatile
    private var engine: Engine? = null

    @Volatile
    private var loadedModel: NativeModelSpec? = null

    @Volatile
    private var activeGeneration: ActiveGeneration? = null

    fun setEventSink(sink: EventSink?) {
        eventSink = sink
    }

    fun capabilities(context: Context): DeviceCapabilities {
        val appContext = context.applicationContext
        val activityManager = appContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memoryInfo = ActivityManager.MemoryInfo().also(activityManager::getMemoryInfo)
        val abis = Build.SUPPORTED_ABIS?.toList().orEmpty()
        val hasArm64 = abis.any { it.equals("arm64-v8a", ignoreCase = true) }
        // Android itself enforces minSdk 24 before this code can run.
        val supported = hasArm64
        val reason = if (hasArm64) {
            "Native CPU-Inferenz ist verfuegbar; WebGPU/Vulkan wird nicht verwendet."
        } else {
            "Das APK benoetigt ein 64-Bit-ARM-Handy (arm64-v8a)."
        }
        val totalRamMb = memoryInfo.totalMem / (1024L * 1024L)

        return DeviceCapabilities(
            native = true,
            runtime = "LiteRT-LM $RUNTIME_VERSION",
            backend = "CPU",
            avoidsVulkan = true,
            apiLevel = Build.VERSION.SDK_INT,
            abis = abis,
            totalRamMb = totalRamMb,
            availableRamMb = memoryInfo.availMem / (1024L * 1024L),
            freeStorageBytes = StatFs(modelsDirectory(appContext).absolutePath).availableBytes,
            cpuCores = Runtime.getRuntime().availableProcessors(),
            cpuThreads = cpuThreadCount(),
            supported = supported,
            reason = reason,
            recommendedModelId = if (totalRamMb >= 7_000L) "gemma-4-e2b-it" else "qwen3-0.6b-mobile",
        )
    }

    fun modelStatus(context: Context, modelId: String): ModelStatus {
        val spec = ModelCatalog.require(modelId)
        val finalFile = modelFile(context.applicationContext, spec)
        val partialFile = partialFile(context.applicationContext, spec)
        val markerFile = checksumMarker(context.applicationContext, spec)
        val activeJob = downloadJobs[modelId]
        val loaded = when {
            activeJob?.isActive == true -> partialFile.length().coerceAtMost(spec.downloadBytes)
            finalFile.exists() -> finalFile.length().coerceAtMost(spec.downloadBytes)
            partialFile.exists() -> partialFile.length().coerceAtMost(spec.downloadBytes)
            else -> 0L
        }
        val state = when {
            activeJob?.isActive == true -> "downloading"
            loadedModel?.id == modelId && engine?.isInitialized() == true -> "loaded"
            finalFile.exists() && finalFile.length() != spec.downloadBytes -> "corrupt"
            finalFile.exists() && markerMatches(markerFile, spec.sha256) -> "ready"
            finalFile.exists() -> "unverified"
            downloadErrors.containsKey(modelId) -> "error"
            partialFile.exists() && partialFile.length() > 0L -> "partial"
            else -> "missing"
        }
        val pct = if (spec.downloadBytes > 0L) {
            ((loaded.toDouble() / spec.downloadBytes.toDouble()) * 100.0).coerceIn(0.0, 100.0)
        } else {
            0.0
        }

        return ModelStatus(
            modelId = modelId,
            state = state,
            loaded = loaded,
            total = spec.downloadBytes,
            pct = pct,
            path = if (finalFile.exists()) finalFile.absolutePath else null,
            error = downloadErrors[modelId],
        )
    }

    fun startDownload(context: Context, modelId: String): DownloadStart {
        val appContext = context.applicationContext
        val spec = ModelCatalog.require(modelId)
        val status = modelStatus(appContext, modelId)
        if (status.state == "ready" || status.state == "loaded") {
            return DownloadStart(modelId, started = false, state = status.state)
        }

        synchronized(downloadJobs) {
            if (downloadJobs[modelId]?.isActive == true) {
                return DownloadStart(modelId, started = false, state = "downloading")
            }

            downloadErrors.remove(modelId)
            lateinit var job: Job
            job = processScope.launch(start = CoroutineStart.LAZY) {
                try {
                    downloadAndVerify(appContext, spec)
                } catch (cancelled: kotlinx.coroutines.CancellationException) {
                    emitDownload(spec, partialFile(appContext, spec).length(), "Download pausiert; erneutes Antippen setzt ihn fort.")
                    throw cancelled
                } catch (error: Throwable) {
                    val message = error.message?.take(500) ?: error.javaClass.simpleName
                    downloadErrors[modelId] = message
                    emitDownload(spec, partialFile(appContext, spec).length(), "Fehler: $message")
                    Log.e(TAG, "Model download failed for $modelId", error)
                } finally {
                    downloadJobs.remove(modelId, job)
                }
            }
            downloadJobs[modelId] = job
            job.start()
        }

        return DownloadStart(modelId, started = true, state = "downloading")
    }

    @OptIn(ExperimentalApi::class)
    suspend fun loadModel(context: Context, modelId: String): String = withContext(Dispatchers.IO) {
        val appContext = context.applicationContext
        val spec = ModelCatalog.require(modelId)
        interrupt(null)

        engineMutex.withLock {
            if (loadedModel?.id == modelId && engine?.isInitialized() == true) {
                return@withLock spec.engineId
            }

            val finalFile = modelFile(appContext, spec)
            require(finalFile.exists()) { "Modell fehlt. Bitte zuerst ${spec.name} herunterladen." }
            require(finalFile.length() == spec.downloadBytes) {
                "Modelldatei ist unvollstaendig (${finalFile.length()} von ${spec.downloadBytes} Bytes)."
            }
            ensureVerified(appContext, spec, finalFile)

            engine?.close()
            engine = null
            loadedModel = null

            val cacheDirectory = File(appContext.cacheDir, "litertlm/${spec.id}").apply { mkdirs() }
            Engine.setNativeMinLogSeverity(LogSeverity.ERROR)
            ExperimentalFlags.enableSpeculativeDecoding = spec.supportsSpeculativeDecoding

            val nextEngine = Engine(
                EngineConfig(
                    modelPath = finalFile.absolutePath,
                    backend = Backend.CPU(threadCount = cpuThreadCount()),
                    maxNumTokens = spec.contextTokens,
                    cacheDir = cacheDirectory.absolutePath,
                ),
            )

            try {
                nextEngine.initialize()
                engine = nextEngine
                loadedModel = spec
                spec.engineId
            } catch (error: Throwable) {
                runCatching { nextEngine.close() }
                throw IllegalStateException("${spec.name} konnte nicht auf der CPU geladen werden: ${error.message}", error)
            }
        }
    }

    suspend fun generate(
        requestId: String,
        system: String,
        user: String,
        maxTokens: Int,
        deterministic: Boolean,
    ): Pair<String, String> = withContext(Dispatchers.IO) {
        require(requestId.isNotBlank()) { "requestId fehlt." }
        require(user.isNotBlank()) { "Die Nutzereingabe ist leer." }

        engineMutex.withLock {
            val activeEngine = engine ?: throw IllegalStateException("Noch kein natives Modell geladen.")
            val spec = loadedModel ?: throw IllegalStateException("Der native Modellstatus ist inkonsistent.")
            val requestedTokens = maxTokens.coerceIn(16, 1_024)
            val sampler = if (deterministic) {
                SamplerConfig(topK = 1, topP = 1.0, temperature = 0.0, seed = 42)
            } else if (spec.id == "qwen3-0.6b-mobile") {
                // Qwen3's recommended non-thinking sampling avoids the slow,
                // fragmented output seen with greedy/thinking defaults.
                SamplerConfig(
                    topK = 20,
                    topP = 0.8,
                    temperature = 0.7,
                    seed = (System.nanoTime() xor requestId.hashCode().toLong()).toInt(),
                )
            } else {
                SamplerConfig(
                    topK = 64,
                    topP = 0.95,
                    temperature = 1.0,
                    seed = (System.nanoTime() xor requestId.hashCode().toLong()).toInt(),
                )
            }
            val conversation = activeEngine.createConversation(
                ConversationConfig(
                    systemInstruction = Contents.of(system.ifBlank { "Du bist Noesis, ein hilfreicher Assistent." }),
                    samplerConfig = sampler,
                ),
            )
            val active = ActiveGeneration(requestId, conversation)
            activeGeneration = active
            val fullText = StringBuilder()
            val textLock = Any()
            val maxCharacters = requestedTokens * CHARS_PER_REQUESTED_TOKEN_GUARD
            val extraContext: Map<String, Any> = if (spec.id == "qwen3-0.6b-mobile") {
                // Das Artefakt ist bereits No-Think; der explizite Kontext
                // verhindert auch bei Runtime-Änderungen unsichtbares <think>.
                mapOf("enable_thinking" to false)
            } else {
                emptyMap()
            }

            try {
                withTimeout(GENERATION_TIMEOUT_MS) {
                    conversation.sendMessageAsync(user, extraContext).collect { message ->
                        currentCoroutineContext().ensureActive()
                        val raw = extractText(message)
                        if (raw.isEmpty()) return@collect

                        val emission = synchronized(textLock) {
                            val remaining = (maxCharacters - fullText.length).coerceAtLeast(0)
                            // LiteRT-LM liefert Message-Deltas. Jedes Delta wird
                            // angehängt; wiederholte Wörter sind legitimer Text
                            // und dürfen nicht heuristisch verworfen werden.
                            val delta = raw.take(remaining)
                            fullText.append(delta)
                            delta to fullText.toString()
                        }

                        if (emission.first.isNotEmpty()) {
                            eventSink?.onToken(requestId, emission.first, emission.second)
                        }
                        if (emission.second.length >= maxCharacters) {
                            active.hardLimitReached.set(true)
                            conversation.cancelProcess()
                        }
                    }
                }
            } catch (timeout: TimeoutCancellationException) {
                runCatching { conversation.cancelProcess() }
                throw IllegalStateException("Die lokale Antwort hat das Zeitlimit ueberschritten.", timeout)
            } catch (error: Throwable) {
                val acceptableStop = active.interrupted.get() || active.hardLimitReached.get()
                if (!acceptableStop || fullText.isEmpty()) throw error
            } finally {
                activeGeneration = null
                runCatching { conversation.close() }
            }

            val answer = synchronized(textLock) { fullText.toString().trim() }
            require(answer.isNotEmpty()) {
                if (active.interrupted.get()) "Die Generierung wurde abgebrochen." else "Das lokale Modell lieferte keinen Text."
            }
            answer to spec.engineId
        }
    }

    fun interrupt(requestId: String?): Boolean {
        val active = activeGeneration ?: return false
        if (!requestId.isNullOrBlank() && active.requestId != requestId) return false
        active.interrupted.set(true)
        return runCatching {
            active.conversation.cancelProcess()
            true
        }.getOrDefault(false)
    }

    suspend fun dispose(expectedModelId: String? = null): Boolean = withContext(Dispatchers.IO) {
        // Vor interrupt() prüfen: Ein verspätetes dispose(A) darf auch eine
        // bereits laufende Antwort des inzwischen geladenen Modells B nicht
        // abbrechen. Unter dem Mutex wird danach erneut geprüft.
        if (expectedModelId != null && loadedModel?.id != expectedModelId) {
            return@withContext false
        }
        interrupt(null)
        engineMutex.withLock {
            // Eine alte Web-Instanz darf die gerade geladene Nachfolger-Engine
            // nicht schließen (nativer Modellwechsel A -> B).
            if (expectedModelId != null && loadedModel?.id != expectedModelId) {
                return@withLock false
            }
            activeGeneration = null
            engine?.close()
            engine = null
            loadedModel = null
            true
        }
    }

    private suspend fun downloadAndVerify(context: Context, spec: NativeModelSpec) {
        val directory = modelsDirectory(context)
        val part = partialFile(context, spec)
        val final = modelFile(context, spec)
        val marker = checksumMarker(context, spec)

        if (final.exists() && markerMatches(marker, spec.sha256) && final.length() == spec.downloadBytes) {
            emitDownload(spec, spec.downloadBytes, "Bereit")
            return
        }
        if (final.exists()) {
            // A process can be killed in the very small window between the
            // atomic model rename and writing the marker. Keep the costly
            // download and reconstruct the marker when the bytes are valid.
            if (final.length() == spec.downloadBytes) {
                emitDownload(spec, spec.downloadBytes, "Vorhandene Datei wird geprueft ...")
                if (sha256(final).equals(spec.sha256, ignoreCase = true)) {
                    writeChecksumMarkerAtomically(marker, spec.sha256)
                    downloadErrors.remove(spec.id)
                    emitDownload(spec, spec.downloadBytes, "Bereit")
                    return
                }
            }
            final.delete()
            marker.delete()
        }
        if (part.length() > spec.downloadBytes) {
            RandomAccessFile(part, "rw").use { it.setLength(0L) }
        }

        var resumeAt = part.length()
        val remainingBytes = spec.downloadBytes - resumeAt
        val freeBytes = StatFs(directory.absolutePath).availableBytes
        require(freeBytes >= remainingBytes + DOWNLOAD_STORAGE_MARGIN_BYTES) {
            "Nicht genug freier Speicher: benoetigt werden noch mindestens ${formatMb(remainingBytes + DOWNLOAD_STORAGE_MARGIN_BYTES)} MB."
        }

        if (resumeAt < spec.downloadBytes) {
            var connection = openConnection(spec.downloadUrl, resumeAt)
            var responseCode = connection.responseCode

            if (resumeAt > 0L && responseCode == HttpURLConnection.HTTP_PARTIAL) {
                val actualStart = contentRangeStart(connection.getHeaderField("Content-Range"))
                if (actualStart != resumeAt) {
                    connection.disconnect()
                    RandomAccessFile(part, "rw").use { it.setLength(0L) }
                    resumeAt = 0L
                    connection = openConnection(spec.downloadUrl, 0L)
                    responseCode = connection.responseCode
                }
            }

            val append = resumeAt > 0L && responseCode == HttpURLConnection.HTTP_PARTIAL
            if (responseCode == HttpURLConnection.HTTP_OK && resumeAt > 0L) {
                resumeAt = 0L
            }
            require(responseCode == HttpURLConnection.HTTP_OK || responseCode == HttpURLConnection.HTTP_PARTIAL) {
                "Download-Server antwortete mit HTTP $responseCode."
            }

            var loaded = resumeAt
            var lastEventAt = 0L
            RandomAccessFile(part, "rw").use { output ->
                if (append) {
                    output.seek(resumeAt)
                } else {
                    output.setLength(0L)
                }
                connection.inputStream.buffered(DOWNLOAD_BUFFER_BYTES).use { input ->
                    val buffer = ByteArray(DOWNLOAD_BUFFER_BYTES)
                    while (true) {
                        currentCoroutineContext().ensureActive()
                        val count = input.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                        loaded += count.toLong()
                        require(loaded <= spec.downloadBytes) { "Der Server lieferte mehr Daten als erwartet." }

                        val now = System.currentTimeMillis()
                        if (now - lastEventAt >= DOWNLOAD_EVENT_INTERVAL_MS) {
                            emitDownload(spec, loaded, "${formatMb(loaded)} / ${formatMb(spec.downloadBytes)} MB")
                            lastEventAt = now
                        }
                    }
                }
                output.fd.sync()
            }
            connection.disconnect()
        }

        require(part.length() == spec.downloadBytes) {
            "Download unvollstaendig: ${part.length()} von ${spec.downloadBytes} Bytes."
        }
        emitDownload(spec, spec.downloadBytes, "SHA-256 wird geprueft ...")
        val actualHash = sha256(part)
        if (!actualHash.equals(spec.sha256, ignoreCase = true)) {
            part.delete()
            throw IllegalStateException("SHA-256 stimmt nicht; die beschaedigte Datei wurde verworfen.")
        }

        Os.rename(part.absolutePath, final.absolutePath)
        writeChecksumMarkerAtomically(marker, spec.sha256)
        downloadErrors.remove(spec.id)
        emitDownload(spec, spec.downloadBytes, "Bereit")
    }

    private fun openConnection(sourceUrl: String, rangeStart: Long): HttpURLConnection {
        var currentUrl = URL(sourceUrl)
        repeat(MAX_REDIRECTS + 1) { redirectCount ->
            val connection = (currentUrl.openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 30_000
                readTimeout = 60_000
                useCaches = false
                setRequestProperty("Accept-Encoding", "identity")
                setRequestProperty("User-Agent", "Noesis-Android/1.0 LiteRT-LM/$RUNTIME_VERSION")
                if (rangeStart > 0L) setRequestProperty("Range", "bytes=$rangeStart-")
            }
            connection.connect()
            val code = connection.responseCode
            if (code !in 300..399) return connection

            val location = connection.getHeaderField("Location")
                ?: throw IllegalStateException("HTTP-Weiterleitung ohne Ziel.")
            connection.disconnect()
            check(redirectCount < MAX_REDIRECTS) { "Zu viele HTTP-Weiterleitungen." }
            currentUrl = URL(currentUrl, location)
        }
        throw IllegalStateException("Zu viele HTTP-Weiterleitungen.")
    }

    private suspend fun ensureVerified(context: Context, spec: NativeModelSpec, file: File) {
        val marker = checksumMarker(context, spec)
        if (markerMatches(marker, spec.sha256)) return
        val actualHash = sha256(file)
        require(actualHash.equals(spec.sha256, ignoreCase = true)) {
            "SHA-256-Pruefung fehlgeschlagen. Bitte das Modell erneut herunterladen."
        }
        writeChecksumMarkerAtomically(marker, spec.sha256)
    }

    private suspend fun sha256(file: File): String = withContext(Dispatchers.IO) {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).buffered(DOWNLOAD_BUFFER_BYTES).use { input ->
            val buffer = ByteArray(DOWNLOAD_BUFFER_BYTES)
            while (true) {
                currentCoroutineContext().ensureActive()
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        digest.digest().joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
    }

    private fun writeChecksumMarkerAtomically(marker: File, hash: String) {
        val temporary = File(marker.parentFile, "${marker.name}.tmp")
        temporary.writeText(hash.lowercase())
        Os.rename(temporary.absolutePath, marker.absolutePath)
    }

    private fun markerMatches(marker: File, expectedHash: String): Boolean =
        runCatching { marker.exists() && marker.readText().trim().equals(expectedHash, ignoreCase = true) }
            .getOrDefault(false)

    private fun contentRangeStart(value: String?): Long? {
        if (value.isNullOrBlank()) return null
        return Regex("^bytes\\s+(\\d+)-", RegexOption.IGNORE_CASE)
            .find(value)
            ?.groupValues
            ?.getOrNull(1)
            ?.toLongOrNull()
    }

    private fun extractText(message: Message): String =
        message.contents.contents.joinToString(separator = "") { content ->
            (content as? Content.Text)?.text.orEmpty()
        }

    private fun emitDownload(spec: NativeModelSpec, loadedBytes: Long, text: String) {
        val loaded = loadedBytes.coerceIn(0L, spec.downloadBytes)
        val pct = if (spec.downloadBytes == 0L) {
            0.0
        } else {
            (loaded.toDouble() / spec.downloadBytes.toDouble()).coerceIn(0.0, 1.0)
        }
        eventSink?.onDownloadProgress(spec.id, loaded, spec.downloadBytes, pct, text)
    }

    private fun modelsDirectory(context: Context): File {
        val directory = context.getExternalFilesDir("models") ?: File(context.filesDir, "models")
        check(directory.exists() || directory.mkdirs()) { "Modellverzeichnis konnte nicht angelegt werden." }
        return directory
    }

    private fun modelFile(context: Context, spec: NativeModelSpec): File =
        File(modelsDirectory(context), spec.fileName)

    private fun partialFile(context: Context, spec: NativeModelSpec): File =
        File(modelsDirectory(context), "${spec.fileName}.part")

    private fun checksumMarker(context: Context, spec: NativeModelSpec): File =
        File(modelsDirectory(context), "${spec.fileName}.sha256")

    private fun cpuThreadCount(): Int = Runtime.getRuntime().availableProcessors().coerceIn(1, 4)

    private fun formatMb(bytes: Long): Long = bytes / (1024L * 1024L)
}
