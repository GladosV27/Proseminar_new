# Quellenprüfung

**Stand:** 17. Juli 2026
Diese Liste enthält nur Quellen, die für Aussagen in Ausarbeitung und Präsentation verwendet werden. Sie ersetzt keine Quellenprüfung der einzelnen Wikipedia-Artikel im Messkorpus.

| Einsatz im Projekt | Verifizierte Primärquelle | Prüfergebnis |
|---|---|---|
| RAG-Grundidee | Lewis et al. (2020), [*Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks*](https://papers.nips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html), NeurIPS 33 | Kombination parametrischen Wissens mit abgerufener, nicht-parametrischer Wissensquelle korrekt belegt. |
| GraphRAG-Abgrenzung | Edge et al. (2024), [*From Local to Global: A Graph RAG Approach to Query-Focused Summarization*](https://www.microsoft.com/en-us/research/publication/from-local-to-global-a-graph-rag-approach-to-query-focused-summarization/), Microsoft Research / arXiv:2404.16130 | Die Originalarbeit arbeitet mit aus Dokumenten abgeleitetem Graphindex und Community-Zusammenfassungen. Das Projekt adaptiert nur die Grundidee; es behauptet keine Replikation. |
| Graph-basiertes Multi-Hop-Retrieval | Gutierrez et al. (2024), [*HippoRAG: Neurobiologically Inspired Long-Term Memory for Large Language Models*](https://proceedings.neurips.cc/paper_files/paper/2024/hash/6ddc001d07ca4f319af96a3024f6dbd1-Abstract-Conference.html), NeurIPS 37 | Knowledge-Graph- und PPR-basiertes Retrieval für Multi-Hop-QA korrekt belegt. |
| Multi-Hop-Fragen mit Evidenz | Yang et al. (2018), [*HotpotQA: A Dataset for Diverse, Explainable Multi-hop Question Answering*](https://aclanthology.org/D18-1259/), EMNLP | Gold-Evidenz und Multi-Hop-Charakter der Fragen korrekt belegt. |
| Browser-Inferenz | MLC AI, [WebLLM-Dokumentation](https://webllm.mlc.ai/docs/index.html) und [WebLLM-Paper](https://arxiv.org/abs/2412.15803) | WebGPU-beschleunigte Inferenz im Browser ist belegt; die tatsächliche Gerätekompatibilität wird im Pilot auf dem Zielgerät geprüft. |
| Mobile Kleinmodelle | Abdin et al. (2024), [*Phi-3 Technical Report: A Highly Capable Language Model Locally on Your Phone*](https://arxiv.org/abs/2404.14219) | Das Paper belegt die Machbarkeit eines kompakten 3,8B-Modells im mobilen Setting. Es ist keine Leistungszusage für das eigene Gerät. |
| Wikipedia-Suche außerhalb des Messlaufs | MediaWiki, [*API:Search*](https://www.mediawiki.org/wiki/API:Search/en) und [*API:Search and discovery*](https://www.mediawiki.org/wiki/API:Search_and_discovery/en) | Die manuelle Suche und die fragegetriebene Recherche verwenden die offizielle Action API. Übermittelt werden nur Suchphrase beziehungsweise freigegebene Entitätsnamen; private Dokumenttexte werden nicht gesendet. |
| Verifizierte Wikipedia-Relationen | MediaWiki, [*API:Query*](https://www.mediawiki.org/wiki/API:Query) | `prop=links` liefert interne Links eines Quellartikels. Noesis erzeugt nur daraus eine `mediawiki_verlinkt_auf`-Kante und speichert URL, Seiten-/Revisions-ID und Zieltitel als Provenienz; die Funktion bleibt außerhalb des eingefrorenen Messkorpus. |
| Browser-Sprachdialog | W3C Web Speech Community Group, [*Web Speech API*](https://webaudio.github.io/web-speech-api/) | Die Spezifikation belegt Spracherkennung, einzelne Sprachzüge, auswählbare Synthesestimmen und Parameter wie Rate/Pitch. Sie ist gegenüber der konkreten Implementierung ausdrücklich offen für server- oder clientbasierte Verarbeitung; deshalb behauptet Noesis weder eine garantierte Offline-Sprachverarbeitung noch eine geräteunabhängige Stimmenqualität. |
| Optionale lokale Neural-Stimme | [Piper](https://github.com/rhasspy/piper), [Piper-TTS-Web](https://github.com/Mintplex-Labs/piper-tts-web), [Modellkarte de_DE-thorsten-medium](https://huggingface.co/rhasspy/piper-voices/blob/main/de/de_DE/thorsten/medium/MODEL_CARD) | Belegt die lokale Piper-Inferenz, die Browser-Integration und das verwendete deutsche Stimmenmodell. Noesis lädt Modell und Laufzeit erst nach bewusster Auswahl; die Web-Speech-Erkennung des Mikrofons bleibt davon getrennt. |

## Korpusquellen und Attribution

Der Messkorpus besteht aus manuell kuratierten Kurzfassungen und Relationen auf Basis ausgewählter deutschsprachiger Wikipedia-Artikel. Vor der Abgabe ergänze ich eine Tabelle mit Artikelname, permanenter Versions-ID, Abrufdatum und der konkreten Verwendung im Korpus. Ohne diese Tabelle werden keine weitergehenden Aussagen über eine vollständige Wikipedia-Abdeckung gemacht.

## Zitierregel in der Präsentation

Die Folien zitieren die fünf zentralen Fach- und Technikquellen in Kurzform. Diese Datei liefert die vollständigen, direkt prüfbaren Links. Quellen begründen theoretische und technische Aussagen; sie ersetzen nicht die Messdaten des eigenen Experiments.
