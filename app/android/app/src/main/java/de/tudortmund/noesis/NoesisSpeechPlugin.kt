package de.tudortmund.noesis

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "NoesisSpeech",
    permissions = [
        Permission(alias = "microphone", strings = [Manifest.permission.RECORD_AUDIO]),
    ],
)
class NoesisSpeechPlugin : Plugin(), RecognitionListener {
    private var recognizer: SpeechRecognizer? = null

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        call.resolve(JSObject().put("available", SpeechRecognizer.isRecognitionAvailable(context)))
    }

    @PluginMethod
    fun startListening(call: PluginCall) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback")
            return
        }
        beginListening(call)
    }

    @PermissionCallback
    private fun microphonePermissionCallback(call: PluginCall) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            beginListening(call)
        } else {
            call.reject("Der Mikrofonzugriff wurde nicht erlaubt.", "PERMISSION_DENIED")
        }
    }

    private fun beginListening(call: PluginCall) {
        val language = call.getString("lang", "de-DE") ?: "de-DE"
        val partialResults = call.getBoolean("interimResults", true) ?: true
        activity.runOnUiThread {
            if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                call.reject("Auf diesem Android-Gerät ist kein Spracherkennungsdienst verfügbar.", "UNAVAILABLE")
                return@runOnUiThread
            }
            destroyRecognizer()
            val next = SpeechRecognizer.createSpeechRecognizer(context)
            recognizer = next
            next.setRecognitionListener(this)
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, partialResults)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                // Android soll ein installiertes Offline-Sprachpaket
                // bevorzugen. Hersteller dürfen trotzdem einen Dienst nutzen;
                // deshalb bleibt der Datenschutzhinweis in der UI bestehen.
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            }
            runCatching { next.startListening(intent) }
                .onSuccess {
                    notifyState("starting")
                    call.resolve(JSObject().put("started", true))
                }
                .onFailure { error ->
                    destroyRecognizer()
                    call.reject(error.message ?: "Spracherkennung konnte nicht gestartet werden.", "START_FAILED", error as? Exception)
                }
        }
    }

    @PluginMethod
    fun stopListening(call: PluginCall) {
        activity.runOnUiThread {
            notifyState("stopping")
            runCatching { recognizer?.stopListening() }
            call.resolve(JSObject().put("stopped", true))
        }
    }

    @PluginMethod
    fun abortListening(call: PluginCall) {
        activity.runOnUiThread {
            runCatching { recognizer?.cancel() }
            destroyRecognizer()
            notifyState("aborted")
            call.resolve(JSObject().put("aborted", true))
        }
    }

    override fun onReadyForSpeech(params: Bundle?) = notifyState("listening")
    override fun onBeginningOfSpeech() = notifyState("listening")
    override fun onRmsChanged(rmsdB: Float) = Unit
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() = notifyState("stopping")
    override fun onEvent(eventType: Int, params: Bundle?) = Unit

    override fun onPartialResults(partialResults: Bundle?) {
        emitTranscript(partialResults, final = false)
    }

    override fun onResults(results: Bundle?) {
        emitTranscript(results, final = true)
        notifyState("ended")
        destroyRecognizer()
    }

    override fun onError(error: Int) {
        val code = when (error) {
            SpeechRecognizer.ERROR_AUDIO -> "audio-capture"
            SpeechRecognizer.ERROR_CLIENT -> "aborted"
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "not-allowed"
            SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED,
            SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "language-not-supported"
            SpeechRecognizer.ERROR_NETWORK,
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network"
            SpeechRecognizer.ERROR_NO_MATCH,
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
            SpeechRecognizer.ERROR_SERVER,
            SpeechRecognizer.ERROR_SERVER_DISCONNECTED -> "service-not-allowed"
            else -> "unknown"
        }
        notifyListeners(
            "nativeSpeechError",
            JSObject().put("error", code).put("nativeCode", error),
        )
        notifyState(if (code == "aborted") "aborted" else "error")
        destroyRecognizer()
    }

    private fun emitTranscript(bundle: Bundle?, final: Boolean) {
        val matches = bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
        val text = matches.firstOrNull()?.trim().orEmpty()
        if (text.isEmpty()) return
        val confidence = bundle?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)?.firstOrNull()
        val payload = JSObject().put("text", text).put("final", final)
        if (confidence != null && confidence >= 0f) payload.put("confidence", confidence.toDouble())
        notifyListeners("nativeSpeechTranscript", payload)
    }

    private fun notifyState(state: String) {
        notifyListeners("nativeSpeechState", JSObject().put("state", state))
    }

    private fun destroyRecognizer() {
        runCatching { recognizer?.destroy() }
        recognizer = null
    }

    override fun handleOnDestroy() {
        activity?.runOnUiThread { destroyRecognizer() }
        super.handleOnDestroy()
    }
}
