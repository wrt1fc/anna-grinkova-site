// Explicit evaluation-only metadata. Never log raw visitor conversations by default.
export function evaluationTelemetry(result={},traces=[],error=null){
 return {generationModel:result.model??null,generationError:error?.message??null,
   styleFiltered:!!result.styleFiltered,groundedFallback:!!result.groundedFallback,
   rawAttempts:traces,
   signalFormatValid:traces.length?traces.at(-1).signal?.formatValid??false:null,
   rawLearningSuggested:traces.length?!!traces.at(-1).signal?.rawSuggested:false};
}
