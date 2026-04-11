"""
Academic Paper Generator

Generates academic papers in LaTeX format from structured JSON data using
language models to create content for each section.

Adapted from .planning/templates/report-generator.py for Claude Code environment.
"""

import json
import subprocess
import os
import re
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field

# --------------------------------
# Data Models
# --------------------------------

@dataclass
class Chapter:
    """Represents a chapter in the paper with its hierarchical structure and content."""
    path: List[str]  # Hierarchical path (e.g., ["Problem Analysis", "Task 1 Analysis"])
    content: str = ""
    title: str = ""
    is_generated: bool = False
    needs_content: bool = False

    @property
    def path_string(self) -> str:
        """Returns the full path as a string (e.g., 'Problem Analysis > Task 1 Analysis')"""
        return " > ".join(self.path)

    @property
    def depth(self) -> int:
        """Returns the heading level (depth in hierarchy)"""
        return len(self.path)

    @property
    def display_title(self) -> str:
        """Returns the chapter title to display (custom title or last path element)"""
        return self.title if self.title else self.path[-1]


# --------------------------------
# Markdown Stripper
# --------------------------------

def strip_markdown(text: str) -> str:
    """Remove common Markdown syntax to prevent LaTeX compilation errors."""
    # Remove bold
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    # Remove italic
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    # Remove headers
    text = re.sub(r'^#+\s+', '', text, flags=re.MULTILINE)
    # Remove bullet points
    text = re.sub(r'^[\-\*]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\d+\.\s+', '', text, flags=re.MULTILINE)
    return text


def escape_underscores_in_quotes(text: str) -> str:
    """Escape underscores inside quoted strings to prevent LaTeX errors."""
    # Handle non-string inputs gracefully (e.g., from broken mocks in tests)
    if not isinstance(text, str):
        return str(text)
    pattern = r'(".*?")|(\'.*?\')'
    def replace_underscores(match):
        content = match.group(0)[1:-1]
        escaped_content = content.replace('_', r'\_')
        return f'"{escaped_content}"' if match.group(0).startswith('"') else f"'{escaped_content}'"
    result = re.sub(pattern, replace_underscores, text, flags=re.DOTALL)
    return result


# --------------------------------
# Prompt Templates (from mm-agent-prompts.py)
# --------------------------------

PAPER_CHAPTER_PROMPT = """\
You are tasked with creating a publication-quality LaTeX chapter for a mathematical modeling research paper. Carefully transform the provided structured draft into a coherent, rigorous, and concise narrative chapter that aligns logically and seamlessly with the previously written content.

## Target Chapter:
{chapter_path}

## Structured Draft:
<structured_draft>
{json_context}
</structured_draft>

## Preceding Chapters (for seamless narrative integration and avoiding repetition):
<preceding_content>
{previous_chapters}
</preceding_content>


## Requirements:
- Write exclusively in accurate, idiomatic LaTeX; avoid Markdown syntax and symbols entirely.
- Clearly indicate the chapter content corresponds precisely to the target chapter `{chapter_path}`; do not repeat or reference explicitly the content of other chapters.
- Integrate any mathematical formulas properly using correct LaTeX environments (\\begin{{align}}). Truncate and wrap long formulas and symbols.
- Present the chapter as a continuous, fluent narrative without section headings, subsections, bullet points, or numbered lists, Response only chapter content, do not include headlines and anything else.
- Critically evaluate the structured draft, selecting only most high-quality important and relevant content. Remove all redundancy, eliminate low-value statements, and distill essential information clearly and succinctly.
- Maintain rigorous academic style, logical coherence, and clarity throughout, ensuring that the chapter integrates naturally with preceding chapters.

## Output Format:
```latex
CHAPTER_CONTENT_TEXT
```

"""

PAPER_CHAPTER_WITH_PRECEDING_PROMPT = """\
You are tasked with generating a publication-quality LaTeX chapter for a mathematical modeling paper. Write a cohesive, academically rigorous chapter that integrates seamlessly with the preceding content of the paper.

## Chapter to write:
{chapter_path}

## Preceding Content:
<preceding_content>
{previous_chapters}
</preceding_content>

## Writing Requirements:
- Use accurate and proper LaTeX syntax throughout, avoid all Markdown syntax or symbols.
- Present the content as a continuous, coherent narrative without using sections, subsections, or bullet points. Response only chapter content, do not include headlines and anything else.
- Make it clear that the section you need to write is `{chapter_path}`. Do not involve the content of other chapters.
"""

PAPER_NOTATION_PROMPT = """
You are an AI assistant trained to extract and typeset the Notations table from a mathematical modeling paper in LaTeX format. Your task is to take the input paper and output a properly formatted LaTeX table displaying the notations used in the paper.

1. Well-structured and easy to read.
2. Properly typeset for LaTeX documents.
3. Adaptive in size and position to fit neatly into any document.
4. Truncate and wrap long formulas, symbols and text in the table for better readability.

<paper>
{previous_chapters}
</paper>

Example of Table Format:
```latex
\\begin{{table}}[H]
    \\centering
    \\renewcommand{{\\arraystretch}}{{1.3}}
    \\begin{{tabular}}{{>{{\\raggedright\\arraybackslash}}p{{3cm}}>{{\\raggedright\\arraybackslash}}p{{11cm}}}}
        \\toprule
        \\textbf{{Notation}} & \\textbf{{Description}} \\\\
        \\midrule
        \\( f(x) \\) & description... \\\\
        \\bottomrule
    \\end{{tabular}}
    \\caption{{Table of Notations}}
    \\label{{tab:notations}}
\\end{{table}}
```

Response only latex table content, do not include headlines and anything else.
"""

PAPER_INFO_PROMPT = """\
You are an expert academic writer tasked with analyzing paper chapters and generating key metadata for a mathematical modeling paper.

# Input Chapters
{paper_chapters}

Based on the content of these chapters, please generate:
1. A concise, descriptive title that reflects the paper's main focus
2. A comprehensive and detailed summary highlighting key findings and methodology
3. 4-6 relevant keywords that capture the paper's main themes

Returns the Legal JSON Format:
```Json
{{
    "title": "A clear, concise title",
    "summary": "A well-structured summary covering the following information: \\n- Restatement and Clarification of the Problem: Describe the problem to be solved in your own words.\\n- Explanation of Assumptions and Their Rationality: Highlight the assumptions made in the modeling process and clearly list all the variables required for the model.\\n- Model Design and Rationality Argumentation: Specify the type of model used or describe the construction of a new model, explain how it was established and the rationale behind its design.\\n- Description of Model Testing and Sensitivity Analysis: Include error analysis and other testing items.",
    "keywords": "keyword1; keyword2; keyword3; keyword4..."
}}
```

Requirements:
- Title should be specific and academic in tone
- Summary should follow standard academic abstract structure and be approximately 400 words
- Keywords should be ordered from general to specific
- must return a strictly legal JSON
"""


# --------------------------------
# Language Model Interface
# --------------------------------

class ContentGenerator:
    """Interface for generating content using language models.

    In Claude Code environment, the LLM is provided by the Skill/Agent runtime.
    This class accepts an optional LLM callable or uses a default implementation.
    """

    def __init__(self, llm: Optional[Callable[[str], str]] = None):
        """Initialize with optional LLM callable.

        Args:
            llm: A callable that takes a prompt string and returns generated text.
                 If None, uses a placeholder that logs the prompt.
        """
        self.llm = llm

    def generate_chapter_content(self, prompt: str) -> str:
        """Generate chapter content using the language model.

        Args:
            prompt: The generation prompt

        Returns:
            Generated chapter content as string
        """
        if self.llm is None:
            # No LLM available - log and return placeholder
            print(f"[ContentGenerator] No LLM configured, returning placeholder for prompt length {len(prompt)}")
            return "[Content placeholder - LLM not configured]"

        response = self.llm(prompt)
        response = escape_underscores_in_quotes(response)
        response = response.replace("```latex", "").replace("```", "")
        response = strip_markdown(response)
        return response


# --------------------------------
# Paper Structure
# --------------------------------

class OutlineGenerator:
    """Creates the hierarchical structure of the paper.

    Follows the fixed outline structure from IDEA.md §11.2 with dynamic
    Task N chapters based on task_count.
    """

    def create_outline(self, task_count: int) -> List[Chapter]:
        """Create a complete chapter structure based on number of tasks.

        Args:
            task_count: Number of tasks in the paper

        Returns:
            List of Chapter objects with hierarchical structure
        """
        print(f"Creating paper outline for {task_count} tasks")

        # Define the structure template
        outline = self._create_base_outline(task_count)

        # Create chapter objects
        chapters = []
        for path in outline:
            # A chapter needs content if it's a leaf node (has no children)
            needs_content = not any(
                other[:len(path)] == path and len(other) > len(path)
                for other in outline
            )
            chapters.append(Chapter(path=path, needs_content=needs_content))

        content_chapters = sum(1 for c in chapters if c.needs_content)
        print(f"Created {len(chapters)} sections, {content_chapters} require content generation")
        for chapter in chapters:
            print(chapter.path_string)
        return chapters

    def _create_base_outline(self, task_count: int) -> List[List[str]]:
        """Define the hierarchical structure of the paper.

        Fixed structure from IDEA.md §11.2 with dynamic Task N chapters.

        Args:
            task_count: Number of tasks

        Returns:
            List of chapter paths (each path is a list of strings)
        """
        outline: List[List[str]] = [
            ["Problem Restatement", "Problem Background"],
            ["Problem Restatement", "Problem Statement"],
            ["Model Assumptions"],
            ["Explanation of Assumptions"],
            ["Problem Analysis"]
        ]

        # Add task-specific analysis chapters
        for i in range(1, task_count + 1):
            outline.append(["Problem Analysis", f"Task {i} Analysis"])

        outline.append(["Solution to the Problem"])

        # Add task-specific solution chapters
        for i in range(1, task_count + 1):
            outline.append(["Solution to the Problem", f"Task {i} Solution", "Model Setup: Assumptions and Chain Models"])
            outline.append(["Solution to the Problem", f"Task {i} Solution", "Model Calculation"])

        # Add conclusion and reference sections
        outline.extend([
            ["Model Conclusion", "Model Advantages"],
            ["Model Conclusion", "Model Limitations"],
            ["Notation and Explanations"]
        ])

        return outline

    def generate_chapter_relevance_map(self, task_count: int) -> Dict[str, List[str]]:
        """Generate chapter relevance mapping based on task count.

        Implements the fine-grained context passing from IDEA.md §11.3.
        Each chapter only receives context from its relevant dependencies,
        avoiding context pollution.

        Args:
            task_count: Number of tasks in the paper

        Returns:
            Dictionary mapping chapter path strings to lists of relevant
            chapter path strings
        """
        relevance_map: Dict[str, List[str]] = {}

        # Model Setup only needs corresponding Task Analysis
        for i in range(1, task_count + 1):
            setup_path = f"Solution to the Problem > Task {i} Solution > Model Setup: Assumptions and Chain Models"
            relevance_map[setup_path] = [f"Problem Analysis > Task {i} Analysis"]

        # Model Calculation needs Task Analysis + Model Setup
        for i in range(1, task_count + 1):
            calculation_path = f"Solution to the Problem > Task {i} Solution > Model Calculation"
            relevance_map[calculation_path] = [
                f"Problem Analysis > Task {i} Analysis",
                f"Solution to the Problem > Task {i} Solution > Model Setup: Assumptions and Chain Models",
            ]

        # Model conclusion chapters should include all task solutions
        task_solutions: List[str] = []
        for i in range(1, task_count + 1):
            task_solutions += [
                f"Solution to the Problem > Task {i} Solution > Model Calculation",
                f"Solution to the Problem > Task {i} Solution > Model Setup: Assumptions and Chain Models"
            ]

        relevance_map["Model Conclusion > Model Advantages"] = task_solutions.copy()
        relevance_map["Model Conclusion > Model Limitations"] = task_solutions.copy()
        relevance_map["Notation and Explanations"] = task_solutions.copy()

        return relevance_map


# --------------------------------
# Context Extraction
# --------------------------------

class ContextExtractor:
    """Extracts relevant data from JSON for each chapter.

    Implements fine-grained context extraction per IDEA.md §11.4,
    only extracting fields needed per chapter type.
    """

    def get_context_for_chapter(self, chapter: Chapter, data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract relevant JSON data for a specific chapter.

        Args:
            chapter: The Chapter object to extract context for
            data: The full JSON data from memory

        Returns:
            Dictionary with only the relevant context for this chapter
        """
        path = chapter.path

        # Handle different chapter types
        if path == ["Problem Restatement", "Problem Background"]:
            return {"problem_background": data.get("problem_background", "")}

        elif path == ["Problem Restatement", "Problem Statement"]:
            return {"problem_requirement": data.get("problem_requirement", "")}

        elif path == ["Model Assumptions"]:
            return self._get_assumptions_context(data)

        elif path == ["Explanation of Assumptions"]:
            return {}

        elif self._is_task_analysis(path):
            return self._get_task_analysis_context(path, data)

        elif self._is_model_setup(path):
            return self._get_model_setup_context(path, data)

        elif self._is_model_calculation(path):
            return self._get_model_calculation_context(path, data)

        # Default empty context for other sections
        return {}

    def _get_assumptions_context(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Get context for assumptions sections."""
        context: Dict[str, Any] = {"problem_analysis": data.get("problem_analysis", "")}

        # Extract task modeling information
        keys = ['task_description', 'task_analysis', 'mathematical_modeling_process']
        context["tasks"] = [
            {k: v for k, v in task.items() if k in keys}
            for task in data.get('tasks', [])
        ]

        return context

    def _get_task_analysis_context(self, path: List[str], data: Dict[str, Any]) -> Dict[str, Any]:
        """Get context for task analysis sections."""
        task_num = self._extract_task_number(path[1])
        if not self._is_valid_task_index(task_num, data):
            return {}

        task_data = data["tasks"][task_num]
        keys = ['task_analysis', 'task_description']
        return {
            f'task_{task_num+1}': {
                k: v for k, v in task_data.items() if k in keys
            }
        }

    def _get_model_setup_context(self, path: List[str], data: Dict[str, Any]) -> Dict[str, Any]:
        """Get context for model setup sections."""
        task_num = self._extract_task_number(path[1])
        if not self._is_valid_task_index(task_num, data):
            return {}

        task_data = data["tasks"][task_num]
        keys = ['preliminary_formulas', 'mathematical_modeling_process']
        return {
            f'task_{task_num+1}': {
                k: task_data.get(k, "") for k in keys
            }
        }

    def _get_model_calculation_context(self, path: List[str], data: Dict[str, Any]) -> Dict[str, Any]:
        """Get context for model calculation sections."""
        task_num = self._extract_task_number(path[1])
        if not self._is_valid_task_index(task_num, data):
            return {}

        task_data = data["tasks"][task_num]
        keys = ['mathematical_modeling_process', 'execution_result', 'solution_interpretation', 'subtask_outcome_analysis']
        return {
            f'task_{task_num+1}': {
                k: task_data.get(k, "") for k in keys
            }
        }

    def _is_task_analysis(self, path: List[str]) -> bool:
        """Check if path is a task analysis section."""
        return (len(path) == 2 and
                path[0] == "Problem Analysis" and
                path[1].startswith("Task "))

    def _is_model_setup(self, path: List[str]) -> bool:
        """Check if path is a model setup section."""
        return (len(path) == 3 and
                path[0] == "Solution to the Problem" and
                path[1].startswith("Task ") and
                path[2] == "Model Setup: Assumptions and Chain Models")

    def _is_model_calculation(self, path: List[str]) -> bool:
        """Check if path is a model calculation section."""
        return (len(path) == 3 and
                path[0] == "Solution to the Problem" and
                path[1].startswith("Task ") and
                path[2] == "Model Calculation")

    def _extract_task_number(self, task_string: str) -> int:
        """Extract task number from strings like 'Task 1 Analysis'."""
        try:
            return int(task_string.split()[1]) - 1  # Convert to 0-indexed
        except (IndexError, ValueError):
            return -1

    def _is_valid_task_index(self, index: int, data: Dict[str, Any]) -> bool:
        """Check if the task index is valid."""
        return 0 <= index < len(data.get("tasks", []))


# --------------------------------
# Prompt Creation
# --------------------------------

class PromptCreator:
    """Creates prompts for the language model using PAPER_CHAPTER_PROMPT templates."""

    def __init__(self):
        pass

    def create_prompt(
        self,
        chapter: Chapter,
        context: Dict[str, Any],
        previous_chapters: List[Chapter]
    ) -> str:
        """Create a prompt for generating chapter content.

        Args:
            chapter: The chapter to generate content for
            context: The extracted context for this chapter
            previous_chapters: List of previously generated chapters

        Returns:
            Formatted prompt string
        """
        # Format JSON context
        json_str = json.dumps(context, indent=2)

        # Format previous chapters
        previous_text = self._format_previous_chapters(previous_chapters)

        if chapter.path == ["Notation and Explanations"]:
            return PAPER_NOTATION_PROMPT.format(
                previous_chapters=previous_text,
            )
        else:
            if json_str == '{}':
                return PAPER_CHAPTER_WITH_PRECEDING_PROMPT.format(
                    chapter_path=chapter.path_string,
                    previous_chapters=previous_text
                )
            else:
                # Build the prompt using the template
                return PAPER_CHAPTER_PROMPT.format(
                    chapter_path=chapter.path_string,
                    json_context=json_str,
                    previous_chapters=previous_text
                )

    def _format_previous_chapters(self, previous_chapters: List[Chapter]) -> str:
        """Format previously completed chapters for context."""
        if not previous_chapters:
            return ""

        text = ""
        for chapter in previous_chapters:
            text += f"Chapter: {chapter.path_string}\n"
            text += f"{chapter.content}\n\n"
        return text


# --------------------------------
# Document Assembly
# --------------------------------

class LatexDocumentAssembler:
    """Assembles the final LaTeX document from generated chapters."""

    def create_document(self, chapters: List[Chapter], metadata: Dict[str, Any]) -> str:
        """Create a complete LaTeX document.

        Args:
            chapters: List of Chapter objects with content
            metadata: Paper metadata (title, team, year, etc.)

        Returns:
            Complete LaTeX document as string
        """
        # Reorder chapters (move Notation chapter after Explanation of Assumptions)
        ordered_chapters = self._reorder_chapters(chapters)

        # Build document parts
        document_parts = [
            self._create_preamble(metadata),
            self._create_abstract(metadata),
            "\\maketitle",
            "\\renewcommand\\cfttoctitlefont{\\hfil\\Large\\bfseries}",
            "\\tableofcontents",
            "\\newpage",
            self._create_body(ordered_chapters, metadata),
            "\\end{document}"
        ]

        return "\n\n".join(document_parts)

    def _reorder_chapters(self, chapters: List[Chapter]) -> List[Chapter]:
        """Reorder chapters for better document structure."""
        reordered = []
        notation_chapter = next((ch for ch in chapters if ch.path == ["Notation and Explanations"]), None)

        for chapter in chapters:
            if chapter.path != ["Notation and Explanations"]:
                reordered.append(chapter)
                # Insert notation chapter after Explanation of Assumptions
                if notation_chapter and chapter.path == ["Explanation of Assumptions"]:
                    reordered.append(notation_chapter)

        return reordered

    def _add_figure(self, figures: List[str]) -> List[str]:
        """Add a figure to the content."""
        figure_str = []
        for i, figure_path in enumerate(figures):
            name = figure_path.split('/')[-1].split('.')[0].replace('_', '\\_')
            figure_str.append(f"""
\\begin{{figure}}[H]
\\centering
\\includegraphics[width=0.5\\textwidth]{{{figure_path}}}
\\caption{{{name}}}
\\end{{figure}}
""")
        return figure_str

    def _add_code(self, codes: List[str]) -> List[str]:
        """Add code appendix sections."""
        code_str = [
            "\\clearpage",
            "\\section{Appendix}",
        ]
        for i, code_path in enumerate(codes):
            with open(code_path, 'r') as f:
                code = f.read()
            name = code_path.split('/')[-1].replace('_', '\\_')
            code_str.append(f"""
\\subsubsection*{{{name}}}

\\begin{{lstlisting}}[language=Python, frame=single, basicstyle=\\ttfamily\\small]
{code}
\\end{{lstlisting}}
""")
        return code_str

    def _create_preamble(self, metadata: Dict[str, Any]) -> str:
        """Create LaTeX preamble with document setup.

        Supports both mcmthesis (MCM/ICM 美赛) and cumcmthesis (CUMCM 国赛)
        templates based on metadata['template'] setting.

        Args:
            metadata: Dictionary with keys: title, team, year, problem_type, template

        Returns:
            LaTeX preamble string
        """
        title = metadata.get("title", "paper_title")
        team = metadata.get("team", "team")
        year = metadata.get("year", "2024")
        problem_type = metadata.get("problem_type", "problem_type")
        template_type = metadata.get('template', 'mcm')

        if template_type == 'cumcm':
            # cumcmthesis for 国赛 (Chinese undergraduate contest)
            return f"""\\documentclass{{cumcmthesis}}
\\赛题类型{{{problem_type}}}
\\队号{{{team}}}
\\年份{{{year}}}

\\usepackage{{palatino}}
\\usepackage{{algorithm}}
\\usepackage{{algpseudocode}}
\\usepackage{{tocloft}}
\\usepackage{{amsmath}}
\\usepackage{{lastpage}}
\\usepackage{{listings}}

\\usepackage{{caption}}
\\usepackage{{subcaption}}

\\title{{{title}}}

\\begin{{document}}"""
        else:
            # mcmthesis for MCM/ICM 美赛 (default)
            return f"""\\documentclass{{mcmthesis}}
\\mcmsetup{{CTeX = false,
        tcn = {team}, problem = {problem_type},
        year = {year},
        sheet = true, titleinsheet = true, keywordsinsheet = true,
        titlepage = false, abstract = true}}

\\usepackage{{palatino}}
\\usepackage{{algorithm}}
\\usepackage{{algpseudocode}}
\\usepackage{{tocloft}}
\\usepackage{{amsmath}}
\\usepackage{{lastpage}}
\\usepackage{{listings}}

\\usepackage{{caption}}
\\usepackage{{subcaption}}

\\renewcommand{{\\cftdot}}{{.}}
\\renewcommand{{\\cftsecleader}}{{\\cftdotfill{{\\cftdotsep}}}}
\\renewcommand{{\\cftsubsecleader}}{{\\cftdotfill{{\\cftdotsep}}}}
\\renewcommand{{\\cftsubsubsecleader}}{{\\cftdotfill{{\\cftdotsep}}}}
\\renewcommand{{\\headset}}{{{year}\\\\MCM/ICM\\\\Summary Sheet}}
\\title{{{title}}}

\\begin{{document}}"""

    def _create_abstract(self, metadata: Dict[str, str]) -> str:
        """Create the abstract section."""
        return f"""\\begin{{abstract}}
{metadata.get('summary', '')}

\\begin{{keywords}}
{metadata.get('keywords', '')}
\\end{{keywords}}
\\end{{abstract}}"""

    def _create_body(self, chapters: List[Chapter], metadata: Dict[str, Any]) -> str:
        """Create the main body of the document from chapters."""
        body_parts: List[str] = []
        current_path: List[str] = []

        for chapter in chapters:
            # Add figure before Model Conclusion if figures available
            if chapter.path == ["Model Conclusion", "Model Advantages"] and metadata.get('figures', []):
                body_parts += self._add_figure(metadata['figures'])

            for i, section in enumerate(chapter.path):
                # If this path level is new or different
                if i >= len(current_path) or section != current_path[i]:
                    # Update current path
                    if len(current_path) <= i:
                        current_path.append(section)
                    else:
                        current_path[i] = section
                        current_path = current_path[:i+1]  # Truncate the path

                    # Use custom title if available for the last level
                    title = chapter.display_title if i == chapter.depth - 1 else section

                    # Add section heading at appropriate level
                    if i == 0:
                        body_parts.append(f"\\section{{{title}}}")
                    elif i == 1:
                        body_parts.append(f"\\subsection{{{title}}}")
                    elif i == 2:
                        body_parts.append(f"\\subsubsection{{{title}}}")

            # Add chapter content if generated
            if chapter.is_generated and chapter.content:
                body_parts.append(chapter.content)

        body_parts.append("\\section{References}")
        if metadata.get('codes', []):
            body_parts += self._add_code(metadata['codes'])
        return "\n\n".join(body_parts)


# --------------------------------
# File Operations
# --------------------------------

class FileManager:
    """Handles file operations for saving papers and generating PDFs."""

    @staticmethod
    def save_to_file(content: str, filepath: str) -> None:
        """Save content to a file.

        Args:
            content: The content to save
            filepath: The target file path
        """
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Document saved to {filepath}")

    @staticmethod
    def generate_pdf(latex_path: str) -> bool:
        """Generate a PDF from a LaTeX file using xelatex.

        XeLaTeX is required for Chinese font support (mcmthesis/cumcmthesis).
        Two-pass compilation ensures TOC and cross-references resolve correctly.

        Args:
            latex_path: Path to the .tex file

        Returns:
            True if PDF generation succeeded, False otherwise
        """
        print(f"Generating PDF from {latex_path}...")

        latex_dir = os.path.dirname(latex_path) or "."
        # Pass 1: Generate TOC and references
        result1 = subprocess.run(
            ["xelatex", "-interaction=nonstopmode", f"-output-directory={latex_dir}", latex_path],
            capture_output=True, text=True
        )
        # Pass 2: Resolve references
        result2 = subprocess.run(
            ["xelatex", "-interaction=nonstopmode", f"-output-directory={latex_dir}", latex_path],
            capture_output=True, text=True
        )

        # Clean up auxiliary files
        FileManager._clean_temp_files(latex_path)

        pdf_path = latex_path.replace('.tex', '.pdf')
        if result1.returncode == 0 and result2.returncode == 0:
            print(f"PDF generated at {pdf_path}")
            return True
        else:
            print(f"PDF generation failed. Check {latex_path.replace('.tex', '.log')}")
            return False

    @staticmethod
    def _clean_temp_files(latex_path: str) -> None:
        """Clean up temporary files created during PDF generation."""
        for ext in ["aux", "log", "toc", "out"]:
            aux_file = latex_path.replace('.tex', f'.{ext}')
            if os.path.exists(aux_file):
                try:
                    os.remove(aux_file)
                except FileNotFoundError:
                    pass  # File was deleted between check and remove


# --------------------------------
# Main Paper Generator
# --------------------------------

class PaperGenerator:
    """Main class that orchestrates the paper generation process."""

    def __init__(self, llm: Optional[Callable[[str], str]] = None):
        """Initialize the paper generator.

        Args:
            llm: Optional LLM callable for content generation.
                 If None, content generation will use placeholders.
        """
        self.content_generator = ContentGenerator(llm)
        self.outline_generator = OutlineGenerator()
        self.context_extractor = ContextExtractor()
        self.prompt_creator = PromptCreator()
        self.document_assembler = LatexDocumentAssembler()
        self.file_manager = FileManager()
        self.llm = llm

    def generate_paper(
        self,
        json_data: Dict[str, Any],
        metadata: Dict[str, Any],
        output_dir: str,
        filename: str
    ) -> None:
        """Generate a complete academic paper from JSON data.

        Args:
            json_data: Structured JSON data from memory
            metadata: Paper metadata (title, team, year, etc.)
            output_dir: Directory to save output files
            filename: Base filename for output (without extension)
        """
        # 1. Create chapter structure
        task_count = len(json_data.get("tasks", []))
        print(f"Starting paper generation with {task_count} tasks")
        chapters = self.outline_generator.create_outline(task_count)

        # Generate chapter relevance map
        chapter_relevance_map = self.outline_generator.generate_chapter_relevance_map(task_count)

        # 2. Generate content for each chapter that needs it
        completed_chapters: List[Chapter] = []
        for chapter in chapters:
            if chapter.needs_content:
                self._generate_chapter_content(chapter, json_data, completed_chapters, chapter_relevance_map)
                completed_chapters.append(chapter)

        # 3. Complete metadata if needed
        complete_metadata = self._complete_metadata(chapters, metadata)

        # 4. Assemble the final document
        document = self.document_assembler.create_document(chapters, complete_metadata)

        # 5. Save and convert to PDF
        latex_path = f"{output_dir}/{filename}.tex"
        self.file_manager.save_to_file(document, latex_path)
        self.file_manager.generate_pdf(latex_path)

    def _generate_chapter_content(
        self,
        chapter: Chapter,
        json_data: Dict[str, Any],
        completed_chapters: List[Chapter],
        chapter_relevance_map: Dict[str, List[str]]
    ) -> None:
        """Generate content for a single chapter."""
        print(f"Generating content for: {chapter.path_string}")

        # Get relevant context data for this chapter
        context = self.context_extractor.get_context_for_chapter(chapter, json_data)

        # Get only the relevant completed chapters for context
        relevant_chapters = self._get_relevant_chapters(chapter, completed_chapters, chapter_relevance_map)

        # Create prompt and generate content
        prompt = self.prompt_creator.create_prompt(
            chapter, context, relevant_chapters
        )
        # Generate content
        response = self.content_generator.generate_chapter_content(prompt)

        # Update chapter with generated content
        chapter.content = response
        chapter.title = ''
        chapter.is_generated = True

    def _get_relevant_chapters(
        self,
        chapter: Chapter,
        completed_chapters: List[Chapter],
        chapter_relevance_map: Dict[str, List[str]]
    ) -> List[Chapter]:
        """Filter completed chapters to only include those relevant to the current chapter."""
        # Get the path string for the current chapter
        current_path = chapter.path_string

        # If this chapter has specific relevant chapters defined in the map
        if current_path in chapter_relevance_map:
            relevant_paths = chapter_relevance_map[current_path]
            # Filter completed chapters to only include those in the relevant paths
            return [ch for ch in completed_chapters
                    if ch.path_string in relevant_paths]

        # Default: return all completed chapters if no specific relevance is defined
        return completed_chapters

    def _format_title(self, chapter: Chapter, generated_title: str) -> str:
        """Format title based on chapter type."""
        # Only use custom titles for certain chapter types
        if (chapter.path[0] == "Problem Analysis" or
            chapter.path[0] == "Solution to the Problem"):
            return generated_title
        return ''

    def _complete_metadata(
        self,
        chapters: List[Chapter],
        provided_metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Complete paper metadata, generating missing fields if needed."""
        # If we need to generate metadata
        if not all(key in provided_metadata for key in ["title", "summary", "keywords"]):
            print("Generating missing paper metadata...")

            # Prepare prompt with chapter contents
            chapters_text = "\n\n".join(
                f"Chapter: {ch.path_string}\n{ch.content}"
                for ch in chapters if ch.is_generated
            )

            prompt = PAPER_INFO_PROMPT.format(paper_chapters=chapters_text)

            # Retry up to 3 times to get valid metadata
            max_retries = 3
            generated_metadata: Dict[str, Any] = {}

            if self.llm is not None:
                for attempt in range(max_retries):
                    try:
                        metadata_response = self.llm(prompt)
                        # Try to parse as JSON
                        import re
                        json_match = re.search(r'\{.*\}', metadata_response, re.DOTALL)
                        if json_match:
                            generated_metadata = json.loads(json_match.group(0))
                            if generated_metadata:
                                break
                    except Exception as e:
                        print(f"Attempt {attempt+1} failed: {str(e)}")
                        if attempt == max_retries - 1:
                            print("All attempts to generate metadata failed")

            # Merge with provided metadata (provided takes precedence)
            return {**generated_metadata, **provided_metadata}

        return provided_metadata


# --------------------------------
# Convenience Functions
# --------------------------------

def generate_paper_from_json(
    llm: Optional[Callable[[str], str]],
    json_data: Dict[str, Any],
    metadata: Dict[str, Any],
    output_dir: str,
    filename: str
) -> None:
    """Generate a paper from JSON data.

    Args:
        llm: Optional LLM callable
        json_data: Structured JSON data from memory
        metadata: Paper metadata
        output_dir: Output directory
        filename: Output filename (without extension)
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    generator = PaperGenerator(llm)
    generator.generate_paper(json_data, metadata, output_dir, filename)
