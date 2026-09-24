Please review my current `agent.md` / `claude.md` file and rewrite it following a strict, minimalist philosophy.

Recent studies and developer experiences have shown that bloated, auto-generated context files actually degrade LLM performance, increase token costs, and distract the model from the actual task. We need to strip this file down to the bare essentials.

Please apply the following rules to rewrite the file:

1. **Delete Codebase Summaries:** Remove all auto-generated architecture overviews, directory structure maps, schema explanations, and "how the app works" descriptions. You (the LLM) are capable of searching the codebase to find this information when you need it. It does not belong in the permanent context.
2. **Delete Standard Commands:** Remove lists of basic run, build, lint, and test commands (e.g., `npm run dev`). Only keep commands if they are highly irregular, counter-intuitive, or strictly unique to this project's workflow.
3. **Remove "Pink Elephants":** Do not mention legacy technologies or deprecated paths just to say "do not use this." Mentioning them only distracts the model and makes it more likely to hallucinate them into existence.
4. **Focus Exclusively on "Band-Aids" (Behavioral Corrections):** The ONLY things that should remain in this file are specific overrides for mistakes you (the LLM) consistently make in this specific project.
   - _Example:_ "If you get stuck on Step 2 of the video pipeline, skip to Step 3 to unblock yourself."
   - _Example:_ "This is a greenfield project with no active users; you are free to completely overwrite schemas without writing migration scripts."
   - _Example:_ "New components need explicit prop types; CI rejects untyped components."
5. **Keep it Extremely Short:** If the information exists somewhere in the actual code (like `package.json` for scripts, or `schema.ts` for database shapes), delete it from this file. The final output should ideally be a short list of highly specific "gotchas."

Here is my current file. Please output the newly refactored, ultra-minimalist version:
