# Computational Solving Rubric

A passing task result must follow the accepted model and direct dependency memories, produce reproducible code or an explicitly justified direct derivation, and explain numerical checks, uncertainty, and limitations. Claimed computed results without successful Runtime Evidence, or writes outside the Attempt Manifest, are Critical findings.

A passing Candidate must fully execute the current task description. Requested calculations, hypothesis tests, metrics, figures, and tables must exist now and be listed in Task Memory where applicable. A design, placeholder, proposed procedure, or promise to finish work in a later task/Attempt is a Critical finding whenever the current task asks for the corresponding result. Any factual contradiction between the Candidate narrative and its cited numeric evidence requires `revise` with a concrete `required_fixes` entry.

## Canonical TaskMemory contract

`memory.json` is the only persisted Task Memory. Passing Candidates must write a JSON object that conforms to the Canonical TaskMemory schema. Gate is the authoritative validator; Critic must flag any deviation as Critical or include it in `required_fixes`, but Gate's verdict remains the source of truth.

Required fields:

- `schema_version`: integer `1`
- `task_id`: non-empty string matching the Attempt scope
- `task_description`: non-empty string
- `modeling_method`: non-empty string
- `result_interpretation`: non-empty string
- `execution_result`: Case-root-relative path string under the Attempt
- `code_outputs`: array of Case-root-relative path strings
- `figures`: array of Case-root-relative path strings

Critical findings that must be reported in `findings` or `required_fixes`:

- Any required field is missing or empty.
- Any free-form replacement field is added (for example `description`, `inputs`, `outputs`, `result`, `reproducibility`) without keeping the Canonical keys. The Critic must require the Actor to rewrite `memory.json` using only the Canonical keys.
- `execution_result`, `code_outputs`, or `figures` contain paths that are not Case-root-relative, escape the Attempt directory, or are missing on disk.
- `schema_version` is not `1`, or any field uses the wrong type (for example `code_outputs` as an object).

Critic's role is to surface every such deviation. Only `pass` Candidates whose `memory.json` satisfies this contract may reach the Gate; Gate revalidates the contract and is the final authority.
