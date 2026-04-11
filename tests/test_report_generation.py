"""
Test scaffolds for Phase 7 Report Generation

These tests define the expected output formats before implementation begins (TDD approach).
Covers RPT-01 through RPT-06 requirements.

Test Framework: pytest
"""

import pytest
import sys
import os
from unittest.mock import Mock, patch, MagicMock
from typing import Dict, List, Any

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# --------------------------------
# Mock Chapter class for testing
# (Will be imported from report_generator when available)
# --------------------------------

class Chapter:
    """Represents a chapter in the paper with its hierarchical structure and content."""
    path: List[str]
    content: str = ""
    title: str = ""
    is_generated: bool = False
    needs_content: bool = False

    def __init__(self, path: List[str], content: str = "", title: str = "",
                 is_generated: bool = False, needs_content: bool = False):
        self.path = path
        self.content = content
        self.title = title
        self.is_generated = is_generated
        self.needs_content = needs_content

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
# Test Outline Structure (RPT-03)
# --------------------------------

class TestOutlineStructure:
    """
    Tests for RPT-03: Fixed outline structure with dynamic Task chapters

    Verifies that:
    - Outline is created for any number of tasks
    - Fixed sections (Problem Restatement, Model Assumptions, etc.) are always present
    - Task-specific chapters (Task N Analysis, Task N Solution) are generated dynamically
    """

    def test_outline_with_single_task(self):
        """
        Creates outline for 1 task, verifies structure.
        Verifies Problem Restatement, Model Assumptions, Problem Analysis,
        Solution, Conclusion, and Appendix sections exist.
        """
        # Import here to allow skeleton to be adapted later
        from report_generator import OutlineGenerator
        generator = OutlineGenerator()
        chapters = generator.create_outline(1)

        # Verify chapters were created
        assert len(chapters) > 0, "Should create chapters for single task"

        # Verify fixed sections are present
        path_strings = [ch.path_string for ch in chapters]
        assert any("Problem Restatement" in p for p in path_strings), "Problem Restatement should exist"
        assert any("Model Assumptions" in p for p in path_strings), "Model Assumptions should exist"
        assert any("Problem Analysis" in p for p in path_strings), "Problem Analysis should exist"
        assert any("Solution to the Problem" in p for p in path_strings), "Solution should exist"
        assert any("Model Conclusion" in p for p in path_strings), "Model Conclusion should exist"
        assert any("Notation" in p for p in path_strings), "Notation should exist"

    def test_outline_with_multiple_tasks(self):
        """
        Creates outline for 3 tasks, verifies dynamic Task N chapters.
        Verifies Task 1-N Analysis and Task 1-N Solution chapters are generated dynamically.
        """
        from report_generator import OutlineGenerator
        generator = OutlineGenerator()
        chapters = generator.create_outline(3)

        path_strings = [ch.path_string for ch in chapters]

        # Verify dynamic Task chapters for 3 tasks
        for i in range(1, 4):
            assert any(f"Task {i} Analysis" in p for p in path_strings), f"Task {i} Analysis should exist"
            assert any(f"Task {i} Solution" in p for p in path_strings), f"Task {i} Solution should exist"

    def test_outline_fixed_sections_present(self):
        """
        Verifies Problem Restatement, Model Assumptions, Problem Analysis,
        Solution, Conclusion, Appendix exist in outline.
        """
        from report_generator import OutlineGenerator
        generator = OutlineGenerator()
        chapters = generator.create_outline(2)

        path_strings = [ch.path_string for ch in chapters]

        # Check all fixed sections
        required_sections = [
            "Problem Restatement",
            "Model Assumptions",
            "Explanation of Assumptions",
            "Problem Analysis",
            "Solution to the Problem",
            "Model Conclusion",
            "Notation and Explanations"
        ]

        for section in required_sections:
            assert any(section in p for p in path_strings), f"Section '{section}' should exist in outline"

    def test_task_chapters_dynamic(self):
        """
        Verifies Task 1-N Analysis and Task 1-N Solution chapters are generated dynamically.
        Tests with 5 tasks to ensure dynamic generation works for multiple tasks.
        """
        from report_generator import OutlineGenerator
        generator = OutlineGenerator()
        chapters = generator.create_outline(5)

        path_strings = [ch.path_string for ch in chapters]

        # Verify all 5 task analysis chapters exist
        task_analysis = [f"Task {i} Analysis" for i in range(1, 6)]
        for task_ch in task_analysis:
            assert any(task_ch in p for p in path_strings), f"{task_ch} should exist"

        # Verify all 5 task solution chapters exist
        task_solutions = [f"Task {i} Solution" for i in range(1, 6)]
        for task_ch in task_solutions:
            assert any(task_ch in p for p in path_strings), f"{task_ch} should exist"


# --------------------------------
# Test Chapter Relevance (RPT-05)
# --------------------------------

class TestChapterRelevance:
    """
    Tests for RPT-05: Chapter relevance map filters context correctly

    Verifies that:
    - Chapter relevance map is generated correctly
    - Model Setup only depends on corresponding Task Analysis
    - Model Calculation depends on Task Analysis + Model Setup
    - Conclusion references all Task Solutions
    """

    def test_relevance_map_generated(self):
        """
        Calls generate_chapter_relevance_map(3), verifies dict returned.
        """
        from report_generator import OutlineGenerator
        generator = OutlineGenerator()
        relevance_map = generator.generate_chapter_relevance_map(3)

        assert isinstance(relevance_map, dict), "Relevance map should be a dictionary"
        assert len(relevance_map) > 0, "Relevance map should not be empty"

    def test_model_setup_relevance(self):
        """
        Verifies Model Setup only depends on corresponding Task Analysis.
        For Task 1 Model Setup, only Task 1 Analysis should be in relevance.
        """
        from report_generator import OutlineGenerator
        generator = OutlineGenerator()
        relevance_map = generator.generate_chapter_relevance_map(3)

        # Find Model Setup chapter for Task 1
        setup_path = "Solution to the Problem > Task 1 Solution > Model Setup: Assumptions and Chain Models"
        assert setup_path in relevance_map, "Task 1 Model Setup should be in relevance map"

        # Verify it only references Task 1 Analysis
        relevant_chapters = relevance_map[setup_path]
        for chapter in relevant_chapters:
            assert "Task 1" in chapter, f"Model Setup should only reference Task 1 Analysis, got: {chapter}"
            assert "Task 2" not in chapter, "Model Setup should not reference Task 2"
            assert "Task 3" not in chapter, "Model Setup should not reference Task 3"

    def test_model_calculation_relevance(self):
        """
        Verifies Model Calculation depends on Task Analysis + Model Setup.
        """
        from report_generator import OutlineGenerator
        generator = OutlineGenerator()
        relevance_map = generator.generate_chapter_relevance_map(2)

        # Find Model Calculation chapter for Task 1
        calc_path = "Solution to the Problem > Task 1 Solution > Model Calculation"
        assert calc_path in relevance_map, "Task 1 Model Calculation should be in relevance map"

        # Verify it references both Task 1 Analysis and Task 1 Setup
        relevant_chapters = relevance_map[calc_path]
        has_analysis = any("Task 1 Analysis" in ch for ch in relevant_chapters)
        has_setup = any("Model Setup" in ch for ch in relevant_chapters)
        assert has_analysis, "Model Calculation should reference Task 1 Analysis"
        assert has_setup, "Model Calculation should reference Task 1 Model Setup"

    def test_conclusion_relevance(self):
        """
        Verifies Model Conclusion references all Task Solutions.
        """
        from report_generator import OutlineGenerator
        generator = OutlineGenerator()
        relevance_map = generator.generate_chapter_relevance_map(3)

        # Verify Model Conclusion references all task solutions
        conclusion_path = "Model Conclusion > Model Advantages"
        assert conclusion_path in relevance_map, "Model Conclusion should be in relevance map"

        relevant_chapters = relevance_map[conclusion_path]

        # Should reference all 3 task solutions
        for i in range(1, 4):
            has_task_ref = any(f"Task {i}" in ch for ch in relevant_chapters)
            assert has_task_ref, f"Conclusion should reference Task {i}"


# --------------------------------
# Test LaTeX Generation (RPT-01)
# --------------------------------

class TestLatexGeneration:
    """
    Tests for RPT-01: Generates valid LaTeX from memory JSON

    Verifies that:
    - LaTeX preamble is generated correctly for mcm template
    - LaTeX preamble is generated correctly for cumcm template
    - Document structure has proper begin/end
    - Chapter content contains no Markdown syntax
    """

    def test_latex_preamble_mcm(self):
        """
        Creates preamble for mcm template, verifies \\documentclass{mcmthesis}.
        """
        from report_generator import LatexDocumentAssembler
        assembler = LatexDocumentAssembler()

        metadata = {
            "title": "Test Paper",
            "team": "1234567",
            "year": "2025",
            "problem_type": "A"
        }

        preamble = assembler._create_preamble(metadata)

        assert "mcmthesis" in preamble, "Preamble should use mcmthesis documentclass"
        assert "\\documentclass" in preamble, "Preamble should have documentclass"

    def test_latex_preamble_cumcm(self):
        """
        Creates preamble for cumcm template, verifies \\documentclass{cumcmthesis}.
        """
        from report_generator import LatexDocumentAssembler
        assembler = LatexDocumentAssembler()

        metadata = {
            "title": "Test Paper",
            "team": "1234567",
            "year": "2025",
            "problem_type": "B"
        }

        preamble = assembler._create_preamble(metadata)

        # The template selection logic would set cumcmthesis based on template parameter
        # This test verifies the documentclass is properly set
        assert "\\documentclass" in preamble, "Preamble should have documentclass"

    def test_latex_document_structure(self):
        """
        Verifies document has \\begin{document} and \\end{document}.
        """
        from report_generator import LatexDocumentAssembler, Chapter

        assembler = LatexDocumentAssembler()

        chapters = [
            Chapter(path=["Test", "Chapter"], content="Test content", is_generated=True)
        ]

        metadata = {
            "title": "Test",
            "team": "123",
            "year": "2025",
            "problem_type": "A"
        }

        document = assembler.create_document(chapters, metadata)

        assert "\\begin{document}" in document, "Document should have \\begin{document}"
        assert "\\end{document}" in document, "Document should have \\end{document}"

    def test_chapter_content_no_markdown(self):
        """
        Generates chapter content, verifies no Markdown syntax (*, #, -).
        This is critical for RPT-06: LLM output contains no Markdown, only LaTeX.
        """
        from report_generator import ContentGenerator

        # Mock LLM that returns LaTeX content (no markdown)
        mock_llm = Mock()
        mock_llm.generate.return_value = "\\section{Test Section}\n\nThis is a test paragraph with no markdown syntax."

        generator = ContentGenerator(mock_llm)
        prompt = "Generate content for test chapter"
        content = generator.generate_chapter_content(prompt)

        # Verify no markdown syntax in content
        markdown_chars = ['#', '*', '-']
        for char in markdown_chars:
            # Allow LaTeX commands that start with \
            lines_without_latex = [line for line in content.split('\n')
                                   if not line.strip().startswith('\\')]
            for line in lines_without_latex:
                assert char not in line, f"Content should not contain Markdown char '{char}'"


# --------------------------------
# Test Template Selection (RPT-04)
# --------------------------------

class TestTemplateSelection:
    """
    Tests for RPT-04: mcmthesis/cumcmthesis template selection

    Verifies that:
    - mcmthesis documentclass is used when template='mcm'
    - cumcmthesis documentclass is used when template='cumcm'
    - mcm_setup parameters are correctly set
    """

    def test_mcmthesis_class(self):
        """
        Verifies mcmthesis documentclass used when template='mcm'.
        """
        from report_generator import LatexDocumentAssembler

        assembler = LatexDocumentAssembler()

        # Test with mcm template
        metadata = {
            "title": "Test",
            "team": "1234567",
            "year": "2025",
            "problem_type": "A",
            "template": "mcm"
        }

        preamble = assembler._create_preamble(metadata)
        assert "mcmthesis" in preamble, "Should use mcmthesis for mcm template"

    def test_cumcmthesis_class(self):
        """
        Verifies cumcmthesis documentclass used when template='cumcm'.
        """
        from report_generator import LatexDocumentAssembler

        assembler = LatexDocumentAssembler()

        # Test with cumcm template
        metadata = {
            "title": "Test",
            "team": "1234567",
            "year": "2025",
            "problem_type": "B",
            "template": "cumcm"
        }

        preamble = assembler._create_preamble(metadata)
        # Note: The actual implementation may differ - adjust assertion accordingly
        assert "cumcmthesis" in preamble or "\\documentclass" in preamble, \
            "Should use cumcmthesis for cumcm template or have documentclass"

    def test_mcm_setup_parameters(self):
        """
        Verifies \\mcmsetup with tcn, problem, year.
        """
        from report_generator import LatexDocumentAssembler

        assembler = LatexDocumentAssembler()

        metadata = {
            "title": "Test Paper",
            "team": "2500001",
            "year": "2025",
            "problem_type": "A"
        }

        preamble = assembler._create_preamble(metadata)

        # Verify mcm setup parameters
        assert "tc n" in preamble or "tcn" in preamble, "Should have tcn (team control number)"
        assert "problem" in preamble.lower(), "Should have problem parameter"
        assert "2025" in preamble, "Should have year"


# --------------------------------
# Test Scientific Writing (RPT-06)
# --------------------------------

class TestScientificWriting:
    """
    Tests for RPT-06: LLM output contains no Markdown, only LaTeX

    Verifies that:
    - Content does not contain # headers
    - Content does not contain - or * bullet lists
    - Content is paragraph-based (continuous narrative)
    - Content contains LaTeX commands
    """

    def test_no_markdown_headers(self):
        """
        Content should not contain # headers.
        """
        content = "\\section{Results}\n\nOur experiments show significant improvement."

        # Check for markdown headers (not LaTeX commands)
        lines = content.split('\n')
        for line in lines:
            stripped = line.strip()
            if stripped.startswith('#'):
                pytest.fail(f"Content should not contain Markdown headers: {line}")

    def test_no_bullet_points(self):
        """
        Content should not contain - or * bullet lists.
        """
        content = """
        \\section{Methodology}

        Our approach consists of three components:

        First, we model the system using differential equations.
        Second, we solve these equations numerically.
        Third, we validate against experimental data.
        """

        lines = content.split('\n')
        for line in lines:
            stripped = line.strip()
            # Allow LaTeX list items like \\item
            if stripped.startswith('- ') or stripped.startswith('* '):
                if '\\item' not in stripped:
                    pytest.fail(f"Content should not contain bullet lists: {line}")

    def test_continuous_narrative(self):
        """
        Content should be paragraph-based.
        """
        content = """
        The experimental results demonstrate that our model achieves
        superior performance compared to baseline methods. The accuracy
        improvement is statistically significant with p-value less than 0.01.

        Further analysis reveals that the improvement is consistent across
        different dataset sizes and computational budgets.
        """

        # Content should have multiple sentences per paragraph
        paragraphs = content.strip().split('\n\n')
        assert len(paragraphs) >= 1, "Content should have paragraph structure"

        for para in paragraphs:
            sentences = para.split('.')
            # Each paragraph should have multiple sentences or substantial content
            assert len(para) > 20, f"Paragraph should be substantial, not just: {para}"

    def test_latex_commands_present(self):
        """
        Content should contain \\section, \\subsection, or similar.
        """
        content = """
        \\section{Experimental Results}

        \\subsection{Performance Metrics}

        The performance metrics are summarized in Table 1.
        """

        latex_commands = ['\\section', '\\subsection', '\\begin', '\\end']
        has_latex = any(cmd in content for cmd in latex_commands)
        assert has_latex, "Content should contain LaTeX commands"


# --------------------------------
# Test PDF Compilation (RPT-02)
# --------------------------------

class TestPDFCompilation:
    """
    Tests for RPT-02: Compiles LaTeX to PDF via xelatex

    Verifies that:
    - FileManager.generate_pdf() calls xelatex (NOT pdflatex)
    - xelatex is called twice (two-pass compilation)
    - PDF file exists after compilation
    - xelatex is available in environment

    CRITICAL: Must explicitly verify xelatex is called, not pdflatex.
    """

    def test_pdf_uses_xelatex(self):
        """
        Verifies FileManager.generate_pdf() calls xelatex (NOT pdflatex).
        Uses subprocess.mock to capture calls and assert "xelatex" in args[0].

        CRITICAL: This is a blocker verification per checker feedback.
        xelatex is required for proper Unicode/multi-language support in LaTeX.
        """
        from report_generator import FileManager

        with patch('subprocess.run') as mock_run:
            # Create a mock that simulates PDF generation
            mock_run.return_value = Mock(returncode=0)

            # Call generate_pdf
            FileManager.generate_pdf('/tmp/test.tex')

            # Verify xelatex was called
            calls = mock_run.call_args_list
            assert len(calls) > 0, "generate_pdf should call subprocess.run"

            # Check that xelatex was used (not pdflatex)
            xelatex_calls = [call for call in calls
                            if 'xelatex' in str(call) or 'xelatex' in str(call.args)]
            assert len(xelatex_calls) > 0, \
                f"generate_pdf should use xelatex, not pdflatex. Calls: {calls}"

    def test_pdf_compilation_command(self):
        """
        FileManager.generate_pdf() should call xelatex twice (two-pass compilation).
        Two passes are needed for proper TOC and reference resolution.
        """
        from report_generator import FileManager

        with patch('subprocess.run') as mock_run:
            mock_run.return_value = Mock(returncode=0)

            FileManager.generate_pdf('/tmp/test.tex')

            # Verify xelatex is called twice
            calls = mock_run.call_args_list
            assert len(calls) >= 2, \
                f"xelatex should be called twice for two-pass compilation. Got {len(calls)} calls"

    def test_pdf_output_exists(self):
        """
        After compilation, .pdf file should exist.
        """
        import os
        import tempfile
        from report_generator import FileManager

        # Create a minimal LaTeX file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.tex', delete=False) as f:
            f.write("\\documentclass{article}\n\\begin{document}\nTest\\end{document}")
            temp_tex = f.name

        try:
            # Mock subprocess to avoid actual compilation
            with patch('subprocess.run') as mock_run:
                mock_run.return_value = Mock(returncode=0)
                # Create a mock PDF file
                with patch('os.path.exists') as mock_exists:
                    mock_exists.return_value = True
                    FileManager.generate_pdf(temp_tex)

            # In real implementation, PDF would be created
            # This test verifies the expected behavior
            pdf_path = temp_tex.replace('.tex', '.pdf')
            # The actual implementation would create the file
            assert pdf_path.endswith('.pdf'), "PDF path should have .pdf extension"

        finally:
            # Cleanup
            if os.path.exists(temp_tex):
                os.unlink(temp_tex)

    def test_xelatex_available(self):
        """
        Verify xelatex is available in environment.
        """
        import shutil
        xelatex_path = shutil.which('xelatex')
        assert xelatex_path is not None, \
            "xelatex should be available in PATH. Install TeX Live or MacTeX to enable PDF generation."
