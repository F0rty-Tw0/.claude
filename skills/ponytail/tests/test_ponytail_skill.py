import unittest
from pathlib import Path


SKILL_PATH = Path(__file__).parents[1] / "SKILL.md"


# Describe: Ponytail simplicity guidance
class PonytailSkillTests(unittest.TestCase):
    def test_prefers_maintainable_solutions_over_shortest_code(self):
        # Given
        skill_text = SKILL_PATH.read_text(encoding="utf-8")

        # When
        required_guidance = (
            "lowest justified maintenance cost",
            "Prefer explicit, readable code over compressed cleverness.",
            "Continue to follow the project's TDD",
        )
        prohibited_guidance = (
            "Can it be one line?** One line.",
            "Shortest working diff wins.",
            "YAGNI applies to tests too.",
        )

        # Then
        for guidance in required_guidance:
            self.assertIn(guidance, skill_text)

        for guidance in prohibited_guidance:
            self.assertNotIn(guidance, skill_text)


if __name__ == "__main__":
    unittest.main()
