package de.tudortmund.noesis

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "NoesisNativeLlm")
class NoesisNativeLlmPlugin : Plugin(), NativeLlmManager.EventSink {
    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun load() {
        NativeLlmManager.setEventSink(this)
    }

    override fun handleOnDestroy() {
        NativeLlmManager.setEventSink(null)
        pluginScope.cancel()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun capabilities(call: PluginCall) {
        runCatching {
            val capabilities = NativeLlmManager.capabilities(context)
            JSObject()
                .put("native", capabilities.native)
                .put("runtime", capabilities.runtime)
                .put("backend", capabilities.backend)
                .put("avoidsVulkan", capabilities.avoidsVulkan)
                .put("apiLevel", capabilities.apiLevel)
                .put("abis", JSArray(capabilities.abis))
                .put("totalRamMB", capabilities.totalRamMb)
                .put("availableRamMB", capabilities.availableRamMb)
                .put("freeStorageBytes", capabilities.freeStorageBytes)
                .put("cpuCores", capabilities.cpuCores)
                .put("cpuThreads", capabilities.cpuThreads)
                .put("supported", capabilities.supported)
                .put("reason", capabilities.reason)
                .put("recommendedModelId", capabilities.recommendedModelId)
        }.onSuccess(call::resolve).onFailure { reject(call, "CAPABILITIES_FAILED", it) }
    }

    @PluginMethod
    fun listModels(call: PluginCall) {
        runCatching {
            val models = JSArray()
            ModelCatalog.models.forEach { spec ->
                val status = NativeLlmManager.modelStatus(context, spec.id)
                models.put(modelToJs(spec, status))
            }
            JSObject().put("models", models)
        }.onSuccess(call::resolve).onFailure { reject(call, "LIST_MODELS_FAILED", it) }
    }

    @PluginMethod
    fun getModelStatus(call: PluginCall) {
        val modelId = requireString(call, "modelId") ?: return
        runCatching { statusToJs(NativeLlmManager.modelStatus(context, modelId)) }
            .onSuccess(call::resolve)
            .onFailure { reject(call, "MODEL_STATUS_FAILED", it) }
    }

    @PluginMethod
    fun downloadModel(call: PluginCall) {
        val modelId = requireString(call, "modelId") ?: return
        runCatching {
            val start = NativeLlmManager.startDownload(context, modelId)
            JSObject()
                .put("modelId", start.modelId)
                .put("started", start.started)
                .put("state", start.state)
        }.onSuccess(call::resolve).onFailure { reject(call, "MODEL_DOWNLOAD_FAILED", it) }
    }

    @PluginMethod
    fun loadModel(call: PluginCall) {
        val modelId = requireString(call, "modelId") ?: return
        pluginScope.launch {
            runCatching {
                val engineId = NativeLlmManager.loadModel(context, modelId)
                JSObject()
                    .put("modelId", modelId)
                    .put("engine", engineId)
                    .put("state", "loaded")
            }.onSuccess(call::resolve).onFailure { reject(call, "MODEL_LOAD_FAILED", it) }
        }
    }

    @PluginMethod
    fun generate(call: PluginCall) {
        val requestId = requireString(call, "requestId") ?: return
        val user = requireString(call, "user") ?: return
        val system = call.getString("system", "").orEmpty()
        val maxTokens = call.getInt("maxTokens", 256) ?: 256
        val deterministic = call.getBoolean("deterministic", false) ?: false

        pluginScope.launch {
            runCatching {
                val (text, engineId) = NativeLlmManager.generate(
                    requestId = requestId,
                    system = system,
                    user = user,
                    maxTokens = maxTokens,
                    deterministic = deterministic,
                )
                JSObject().put("text", text).put("engine", engineId)
            }.onSuccess(call::resolve).onFailure { reject(call, "GENERATION_FAILED", it) }
        }
    }

    @PluginMethod
    fun interrupt(call: PluginCall) {
        val requestId = call.getString("requestId")
        val interrupted = NativeLlmManager.interrupt(requestId)
        call.resolve(
            JSObject()
                .put("interrupted", interrupted)
                .also { result -> if (!requestId.isNullOrBlank()) result.put("requestId", requestId) },
        )
    }

    @PluginMethod
    fun dispose(call: PluginCall) {
        val expectedModelId = call.getString("modelId")?.trim()?.ifEmpty { null }
        pluginScope.launch {
            runCatching {
                val disposed = NativeLlmManager.dispose(expectedModelId)
                JSObject().put("disposed", disposed)
            }.onSuccess(call::resolve).onFailure { reject(call, "DISPOSE_FAILED", it) }
        }
    }

    override fun onDownloadProgress(modelId: String, loaded: Long, total: Long, pct: Double, text: String) {
        postEvent(
            "nativeLlmDownloadProgress",
            JSObject()
                .put("modelId", modelId)
                .put("loaded", loaded)
                .put("total", total)
                .put("pct", pct)
                .put("text", text),
        )
    }

    override fun onToken(requestId: String, delta: String, text: String) {
        postEvent(
            "nativeLlmToken",
            JSObject()
                .put("requestId", requestId)
                .put("delta", delta)
                .put("text", text),
        )
    }

    private fun postEvent(eventName: String, payload: JSObject) {
        val currentActivity = activity ?: return
        currentActivity.runOnUiThread { notifyListeners(eventName, payload) }
    }

    private fun modelToJs(spec: NativeModelSpec, status: NativeLlmManager.ModelStatus): JSObject =
        JSObject()
            .put("id", spec.id)
            .put("engine", spec.engineId)
            .put("name", spec.name)
            .put("params", spec.params)
            .put("tier", spec.tier)
            .put("downloadBytes", spec.downloadBytes)
            .put("downloadMB", (spec.downloadBytes + 999_999L) / 1_000_000L)
            .put("contextTokens", spec.contextTokens)
            .put("minimumRamMB", spec.minimumRamMb)
            .put("minimumRamGB", spec.minimumRamMb / 1_000L)
            .put("recommended", spec.recommended)
            .put("note", spec.note)
            .put("status", statusToJs(status))

    private fun statusToJs(status: NativeLlmManager.ModelStatus): JSObject =
        JSObject()
            .put("modelId", status.modelId)
            .put("state", status.state)
            .put("loaded", status.loaded)
            .put("total", status.total)
            .put("pct", status.pct)
            .also { result ->
                status.path?.let { result.put("path", it) }
                status.error?.let { result.put("error", it) }
            }

    private fun requireString(call: PluginCall, field: String): String? {
        val value = call.getString(field)?.trim()
        if (value.isNullOrEmpty()) {
            call.reject("Pflichtfeld '$field' fehlt.", "INVALID_ARGUMENT")
            return null
        }
        return value
    }

    private fun reject(call: PluginCall, code: String, error: Throwable) {
        val exception = error as? Exception ?: RuntimeException(error)
        call.reject(error.message ?: error.javaClass.simpleName, code, exception)
    }
}
