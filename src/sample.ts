import { PROJECT_FILE } from "./project/model";

/** A small bundled project so first-run users have something to explore. */
export const SAMPLE_TITLE = "The Lantern Road";

export const SAMPLE_FILES: Record<string, string> = {
  [PROJECT_FILE]: JSON.stringify(
    {
      version: 1,
      title: SAMPLE_TITLE,
      order: {
        Manuscript: ["Chapter 1 - The Ferry", "Chapter 2 - Greywater"],
        Characters: ["Mara Venn", "Old Tom"],
      },
    },
    null,
    2,
  ),

  "Manuscript/Chapter 1 - The Ferry.md": `---
synopsis: Mara crosses the river at dusk and meets the ferryman.
status: draft
---

The river was the colour of pewter by the time [[Mara Venn|Mara]] reached the landing. She set [[The Brass Lantern|the lantern]] on the post and waited for it to steady.

[[Old Tom]] was already at the pole, as if he had been waiting for her all day. "You're late," he said, which was not true, and which they both let pass.

"How far to Greywater?"

He looked at the lantern before he looked at her. "Far enough that you'll want that lit."

***

Halfway across, the fog came down. Mara Venn kept one hand on the rail and the other on the lantern's ring, and did not look at the water.
`,

  "Manuscript/Chapter 2 - Greywater.md": `---
synopsis: Arrival in the drowned town. Something answers the lantern.
status: draft
---

[[Greywater]] rose out of the fog one roof at a time.

Mara counted the steeples — three, though the map in her pocket swore there had only ever been two. Tom tied off the ferry without a word.

"You'll find nobody here who'll admit to living here," he said at last.
`,

  "Characters/Mara Venn.md": `---
aliases:
  - Mara
summary: A lamplighter's daughter carrying her mother's lantern to a town that shouldn't exist.
---

## Appearance

Tall, wind-burned, a burn scar across the back of her left hand.

## Wants

To deliver [[The Brass Lantern]] and go home before the river freezes.

## Fears

Deep water. Being asked what she saw in the fog.
`,

  "Characters/Old Tom.md": `---
aliases:
  - Tom
  - the ferryman
summary: The ferryman. Older than he looks, which is saying something.
---

Has run the crossing to [[Greywater]] for as long as anyone remembers. Never charges the same fare twice.
`,

  "Locations/Greywater.md": `---
summary: A town half-swallowed by the river; its steeples outnumber its maps.
---

Built on stilts, then on the rooftops of the town before it. Fog most evenings.
`,

  "Items/The Brass Lantern.md": `---
aliases:
  - the lantern
summary: Mara's mother's lantern. Burns without oil when it is near the river.
---

Dented brass, a ring handle worn smooth. The glass is newer than the frame.
`,

  "Notes/Ideas.md": `Try clicking a highlighted name in a chapter, or type [[ to link a character, place or item.

Open a character to see every chapter they appear in, plus chapters that mention them without a link.
`,
};
