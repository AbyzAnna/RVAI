# Interaction design: conversation to useful result

Reference supplied by Murilo: https://chatgpt.com/share/6ade1f03-b0d8-83ea-aaa1-d83ed7629f1e . The shared URL was opened, but readable content was unavailable through web extraction; use the full conversation pasted by Murilo in this task as the working reference.

The interface follows the stated flow: goal → constraints → existing alternatives → capability comparison → gaps → small next-step plan. It must support eventual conversational clarification without pretending the current static demo understands free text.

For today's UI, collect goal plus explicit category/features, show the interpreted structured request, show evidence and unknowns, provide practical next steps and export a local comparison brief. Show that this is catalog mode. Anna's agent will own goal extraction, clarifying questions, tool selection, structured action plans and actual progress events. No model or orchestrator is implemented by the UI.

Future API display slots: a clarifying question, tool progress label (not private reasoning), recommendations, a configuration/implementation plan, evaluation issues and known limitations. Actual build/patch approval must be supported by Anna's backend; do not add a decorative execution button. Prefer existing solutions and configuration before original feature implementation. AlternativeTo is discovery; Cutter is outside the hackathon path.
