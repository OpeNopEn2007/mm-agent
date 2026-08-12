---
name: mm-hmml
description: Retrieve HMML method candidates for a current modeling Attempt.
---

# HMML Retrieval

Call `mm_agent_hmml` only with a retrieved-methods path listed in the current Modeler Manifest. Record its returned provenance unchanged. Similarity ranks candidates; explain the selected method's assumptions, variables, equations, and rejected alternatives in the modeling candidate. A BM25 result is valid degraded evidence and must remain labeled as such.
