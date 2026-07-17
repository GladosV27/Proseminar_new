export interface DevicePreflightResult {
  state: 'ready' | 'unsupported' | 'failed'
  label: string
  detail: string
  adapterInfo?: string
}

interface MinimalGpu {
  requestAdapter: (options?: Record<string, unknown>) => Promise<any>
}

/**
 * Führt nicht nur eine Feature-Abfrage aus, sondern erzeugt und startet eine
 * minimale Compute-Pipeline. Genau dieser Schritt deckt Geräte auf, die WebGPU
 * melden, beim tatsächlichen Vulkan-/Dawn-Pipelinebau aber scheitern.
 */
export async function runWebGpuPreflight(): Promise<DevicePreflightResult> {
  const gpu = (navigator as Navigator & { gpu?: MinimalGpu }).gpu
  if (!gpu) return {
    state: 'unsupported',
    label: 'WebGPU fehlt',
    detail: 'Dieser Browser bietet keine WebGPU-Schnittstelle. Nutze das lokale WebAssembly/CPU-Modell.',
  }
  let device: any
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) throw new Error('Kein kompatibler GPU-Adapter verfügbar.')
    device = await adapter.requestDevice()
    const module = device.createShaderModule({
      code: '@compute @workgroup_size(1) fn main() {}',
    })
    const descriptor = {
      layout: 'auto',
      compute: { module, entryPoint: 'main' },
    }
    device.pushErrorScope?.('validation')
    const pipeline = device.createComputePipelineAsync
      ? await device.createComputePipelineAsync(descriptor)
      : device.createComputePipeline(descriptor)
    const validationError = await device.popErrorScope?.()
    if (validationError) throw new Error(validationError.message || 'WebGPU-Validierungsfehler beim Pipelinebau.')
    const encoder = device.createCommandEncoder()
    const pass = encoder.beginComputePass()
    pass.setPipeline(pipeline)
    pass.dispatchWorkgroups(1)
    pass.end()
    device.queue.submit([encoder.finish()])
    await device.queue.onSubmittedWorkDone()
    const info = adapter.info
    const adapterInfo = [info?.vendor, info?.architecture, info?.device].filter(Boolean).join(' · ')
    return {
      state: 'ready',
      label: 'Compute-Test bestanden',
      detail: 'Eine echte WebGPU-Compute-Pipeline wurde erstellt und ausgeführt.',
      adapterInfo: adapterInfo || undefined,
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      state: 'failed',
      label: 'Compute-Test fehlgeschlagen',
      detail: `${detail} Nutze auf diesem Gerät das lokale WebAssembly/CPU-Modell; es greift nicht auf Vulkan zu.`,
    }
  } finally {
    try { device?.destroy?.() } catch { /* optional cleanup */ }
  }
}
