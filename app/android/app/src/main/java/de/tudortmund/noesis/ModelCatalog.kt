package de.tudortmund.noesis

/**
 * Models that are known to work with the pinned LiteRT-LM runtime.
 *
 * The model files deliberately stay outside the APK. They are downloaded into
 * app-private storage, checked byte-for-byte and only then made visible to the
 * inference engine.
 */
data class NativeModelSpec(
    val id: String,
    val name: String,
    val params: String,
    val tier: String,
    val fileName: String,
    val downloadUrl: String,
    val downloadBytes: Long,
    val sha256: String,
    val contextTokens: Int,
    val minimumRamMb: Long,
    val recommended: Boolean,
    val supportsSpeculativeDecoding: Boolean,
    val note: String,
) {
    val engineId: String
        get() = "native:$id"
}

object ModelCatalog {
    val models: List<NativeModelSpec> = listOf(
        NativeModelSpec(
            id = "gemma-4-e2b-it",
            name = "Gemma 4 E2B IT",
            params = "E2B",
            tier = "quality",
            fileName = "gemma-4-E2B-it.litertlm",
            downloadUrl = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/9262660a1676eed6d0c477ab1a86344430854664/gemma-4-E2B-it.litertlm",
            downloadBytes = 2_588_147_712L,
            sha256 = "181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c",
            contextTokens = 4_096,
            minimumRamMb = 7_000,
            recommended = true,
            supportsSpeculativeDecoding = true,
            note = "Beste lokale Antwortqualitaet; fuer aktuelle 8-GB-ARM64-Handys.",
        ),
        NativeModelSpec(
            id = "qwen3-0.6b-mobile",
            name = "Qwen3 0.6B Mobile",
            params = "0,6 Mrd.",
            tier = "compatibility",
            fileName = "qwen3_0.6b_nothink_q4_block32_ekv1280.litertlm",
            downloadUrl = "https://huggingface.co/litert-community/Qwen3-0.6B-int4/resolve/6aa2daf8aba4aa456797fb8040b36a3948bcfda7/qwen3_0.6b_nothink_q4_block32_ekv1280.litertlm",
            downloadBytes = 347_251_840L,
            sha256 = "2df6821ec12702dafd33915e7a1a1adc7c4b053f3672fd9555dfaf3a114c4139",
            contextTokens = 1_280,
            minimumRamMb = 3_400,
            recommended = false,
            supportsSpeculativeDecoding = false,
            note = "Oeffentliches No-Think-INT4-Modell fuer schnelle direkte CPU-Antworten auf Handys mit weniger Speicher.",
        ),
    )

    fun find(modelId: String): NativeModelSpec? = models.firstOrNull { it.id == modelId }

    fun require(modelId: String): NativeModelSpec =
        find(modelId) ?: throw IllegalArgumentException("Unbekanntes natives Modell: $modelId")
}
