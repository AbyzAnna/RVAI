# RevAI Palette Reference (provisional)

Brief for the next styling pass. Source: one user-supplied palette image (water
surface with a grid of rounded octagonal color tiles). User note: "This should be
the color palette roughly. For actual design I will provide more stuff."

Status: **color direction only.** Not a layout, texture, or composition spec.
Wait for further user design references before finalizing visual composition.

## What the image shows
- Deep ocean navy and dark petrol blue water dominate the frame.
- Bright turquoise/cyan and pale aqua highlights (caustic light, top tiles).
- Vivid coral/crimson red tiles, plus darker crimson and soft coral pink.
- A muted blue-gray tile and a near-black dark plum tile.

## Provisional tokens (approximate, eyeballed; not sampled)
| Token            | Hex       | Direction                         |
|------------------|-----------|-----------------------------------|
| `--navy`         | `#052A40` | deep ocean navy                   |
| `--petrol`       | `#045C73` | dark petrol blue                  |
| `--cyan`         | `#00B8C8` | bright turquoise/cyan             |
| `--aqua-light`   | `#8CD5D8` | pale aqua                         |
| `--red`          | `#E20D32` | vivid coral/crimson red           |
| `--crimson`      | `#A60925` | darker crimson                    |
| `--pink`         | `#EA839A` | soft coral pink                   |
| `--muted`        | `#88A1AC` | muted blue-gray                   |
| `--plum`         | `#301B2B` | dark plum                         |
| `--offwhite`     | `#F4FAFC` | neutral light surface (not in image) |

Treat all values as approximate until the user provides more references.

## Recommended roles
- **Navy**: primary text color on light surfaces; deep section surfaces (header,
  hero bands, Innovate chat chrome) with light text on top.
- **Petrol**: secondary deep surface, borders/dividers on dark areas, hover on navy.
- **Cyan / aqua**: primary accent (active tab indicator, focus rings, links on
  dark surfaces, primary action). Avoid cyan as body text on offwhite.
- **Red**: small emphasis and contrast only (a badge, a highlight mark, one key
  CTA at most). Not every button. Do **not** reuse it as the error color; define
  a separate error/warning treatment so meaning is not conflated.
- **Pink / crimson**: supporting tints for red emphasis (chips, subtle backgrounds).
- **Muted**: secondary text on dark surfaces, metadata, disabled states.
- **Plum**: optional deepest shade for footers or overlays; use sparingly.
- **Offwhite**: keep neutral light surfaces for reading-heavy areas (Alternatives
  catalog cards, About copy) to preserve legibility.

## Guardrails
- Do not copy the water texture or use the image as a page background unless the
  user later asks for it. The octagon tile shape is also not a directive yet.
- Avoid large blocks of red or teal text, and long text on saturated fills.
- Final CSS pass must run explicit contrast checks (WCAG AA: 4.5:1 body, 3:1
  large text/UI) for each text/surface pair actually used. None have been
  performed for this doc; pairs to check first: cyan on offwhite, white on cyan,
  white on red, muted on navy, navy on aqua-light.

## Product context to preserve
- Four global views: About, Alternatives (secondary), Innovate (primary:
  chat/creation/extension), RVAI OpenSource (future original project library).
- Palette work is visual only: no functional, content-flow, or backend/auth/DB
  changes (Anna owns backend/auth/DB).
- Coordinate with the in-progress four-tab navigation CSS in `ui/styles.css`;
  introduce tokens as CSS custom properties rather than rewriting its rules.

## Open questions (ask only if later references don't answer them)
1. Should the overall UI lean dark (navy-dominant surfaces) or light (offwhite
   surfaces with navy/aqua accents)?
2. How prominent should red be: rare accent only, or a recurring brand color
   (e.g., the Innovate primary action)?
