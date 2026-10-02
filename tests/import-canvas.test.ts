import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  ACCEPTED_EXTENSIONS,
  canvasPriority,
  describeParseFailure,
  detectAndParse,
  type ParsedAssignment,
  type ParseResult,
  parseCanvasJson,
  parseCanvasXml,
  parseCourseDataJs,
  plainDescription,
} from "@/lib/import/canvas";

/**
 * The Canvas importer.
 *
 * This logic lived inline in `settings-content.tsx` — mixed with file reading
 * and four `setState` calls — and so had never been run by a test. Every case
 * below pins a specific defect found when it was lifted out:
 *
 *   · a greedy regex that broke on anything after the COURSE_DATA object
 *   · two unguarded `JSON.parse` calls behind one catch-all message
 *   · malformed XML reported as "no assignments found" rather than "not XML"
 *   · a dedupe that ignored subject, silently merging two courses' assignments
 *   · `for...of` over whatever `modules` happened to be
 *   · an unsupported extension falling through as an empty result
 *
 * happy-dom rather than the global registrator: `DOMParser` is only needed by
 * one module, and registering a DOM globally would replace the `navigator` that
 * `data-assignments.test.ts` redefines to test the offline path — bun runs every
 * test file in one process, so that leaks.
 */

const xmlWindow = new Window();
const readXml = (xml: string) => new xmlWindow.DOMParser().parseFromString(xml, "text/xml") as unknown as Document;

/** Asserts success and returns the rows, so a failure reads as a failed test rather than a type error. */
function rows(result: ParseResult): ParsedAssignment[] {
  if (!result.ok) throw new Error(`expected a successful parse, got ${result.reason.kind}`);
  return result.assignments;
}

function titles(result: ParseResult): string[] {
  return rows(result).map((a) => a.title);
}

// ---------------------------------------------------------------------------
// course-data.js
// ---------------------------------------------------------------------------

describe("parseCourseDataJs", () => {
  const courseData = {
    title: "Biology 201",
    assignments: [{ title: "Lab report", dueAt: "2026-10-01T23:59:00Z", pointsPossible: 10, content: "Write it up" }],
  };

  test("reads the object out of a window.COURSE_DATA assignment", () => {
    const result = parseCourseDataJs(`window.COURSE_DATA = ${JSON.stringify(courseData)};`);

    expect(rows(result)).toEqual([
      {
        title: "Lab report",
        subject: "Biology 201",
        description: "Write it up",
        due_date: "2026-10-01T23:59:00.000Z",
        priority: "high",
      },
    ]);
  });

  // The old regex was /window\.COURSE_DATA\s*=\s*(\{[\s\S]*\})/. `[\s\S]*` is
  // greedy, so it captured through to the last `}` in the file — swallowing
  // whatever followed and failing JSON.parse on a file that was perfectly valid.
  test("stops at the matching brace, not the last one in the file", () => {
    const text = `window.COURSE_DATA = ${JSON.stringify(courseData)};\nfunction later() { return {}; }\n`;

    expect(titles(parseCourseDataJs(text))).toEqual(["Lab report"]);
  });

  test("survives a trailing sourcemap comment", () => {
    const text = `window.COURSE_DATA = ${JSON.stringify(courseData)};\n//# sourceMappingURL=course-data.js.map\n`;

    expect(titles(parseCourseDataJs(text))).toEqual(["Lab report"]);
  });

  // Only `window.` used to match, so both of these were reported as "could not
  // find COURSE_DATA" even though the data was right there.
  test.each([
    ["var", `var COURSE_DATA = `],
    ["const", `const COURSE_DATA = `],
    ["globalThis", `globalThis.COURSE_DATA = `],
    ["self", `self.COURSE_DATA = `],
  ])("accepts a %s assignment", (_name, prefix) => {
    expect(titles(parseCourseDataJs(`${prefix}${JSON.stringify(courseData)};`))).toEqual(["Lab report"]);
  });

  test("is not confused by a brace inside a title", () => {
    const withBrace = { title: "Art", assignments: [{ title: "Essay {draft}", dueAt: "2026-10-01T12:00:00Z" }] };

    expect(titles(parseCourseDataJs(`window.COURSE_DATA = ${JSON.stringify(withBrace)};`))).toEqual(["Essay {draft}"]);
  });

  test("reports a missing assignment rather than an empty import", () => {
    const result = parseCourseDataJs("console.log('not a canvas export');");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.kind).toBe("no-course-data");
  });

  // `COURSE_DATA = normalise({...})` — the braces are an argument, not the data.
  test("refuses a call expression rather than parsing its argument", () => {
    const result = parseCourseDataJs("window.COURSE_DATA = normalise({ title: 'x' });");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.kind).toBe("no-course-data");
  });

  test("distinguishes broken JSON from a missing assignment", () => {
    const result = parseCourseDataJs("window.COURSE_DATA = { title: 'unquoted keys are not JSON' };");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.kind).toBe("invalid-json");
  });
});

// ---------------------------------------------------------------------------
// .json
// ---------------------------------------------------------------------------

describe("parseCanvasJson", () => {
  test("walks modules, assignments and quizzes", () => {
    const result = parseCanvasJson(
      JSON.stringify({
        title: "History 101",
        modules: [
          {
            items: [
              { type: "Assignment", title: "Essay", dueAt: "2026-11-02T23:59:00Z" },
              { type: "Quizzes::Quiz", title: "Quiz 1", dueAt: "2026-11-05T23:59:00Z" },
              { type: "Page", title: "Reading list", dueAt: "2026-11-06T23:59:00Z" },
            ],
          },
        ],
        assignments: [{ title: "Source analysis", dueAt: "2026-11-09T23:59:00Z" }],
        quizzes: [{ title: "Quiz 2", dueAt: "2026-11-12T23:59:00Z" }],
      }),
    );

    // The Page is not coursework and is left out.
    expect(titles(result)).toEqual(["Essay", "Quiz 1", "Source analysis", "Quiz 2"]);
  });

  test("takes the subject from the course title", () => {
    const result = parseCanvasJson(
      JSON.stringify({ title: "History 101", assignments: [{ title: "Essay", dueAt: "2026-11-02T23:59:00Z" }] }),
    );

    expect(rows(result)[0].subject).toBe("History 101");
  });

  test("reads a bare array of items", () => {
    const result = parseCanvasJson(
      JSON.stringify([{ name: "Problem set 3", course_name: "Maths", due_at: "2026-09-30T17:00:00Z" }]),
    );

    expect(rows(result)).toEqual([
      {
        title: "Problem set 3",
        subject: "Maths",
        description: null,
        due_date: "2026-09-30T17:00:00.000Z",
        priority: "low",
      },
    ]);
  });

  test("reads an object wrapping an items array", () => {
    const result = parseCanvasJson(
      JSON.stringify({ items: [{ assignment_name: "Reading", course: "English", dueAt: "2026-09-30T17:00:00Z" }] }),
    );

    expect(titles(result)).toEqual(["Reading"]);
  });

  // The flat branch used to hardcode priority: "medium" and never look at
  // points, so a flat export lost the only signal it carried about importance.
  test("derives priority from points on a flat export", () => {
    const result = parseCanvasJson(
      JSON.stringify([
        { title: "Big", subject: "S", due_at: "2026-09-30T17:00:00Z", points_possible: 20 },
        { title: "Middling", subject: "S", due_at: "2026-09-30T17:00:00Z", points_possible: "3" },
        { title: "Small", subject: "S", due_at: "2026-09-30T17:00:00Z", points_possible: 1 },
      ]),
    );

    expect(rows(result).map((a) => a.priority)).toEqual(["high", "medium", "low"]);
  });

  test("reports invalid JSON as such", () => {
    const result = parseCanvasJson("{ not json");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.kind).toBe("invalid-json");
  });

  // `data.modules ?? []` did not help when `modules` was a string: `for...of`
  // over a string iterates characters, and over a number throws.
  test.each([
    ["a string", '{"modules":"none"}'],
    ["a number", '{"modules":3}'],
    ["null items", '{"modules":[{"items":null}]}'],
    ["an object", '{"assignments":{"a":1}}'],
  ])("treats %s where an array belongs as nothing to import", (_name, json) => {
    expect(rows(parseCanvasJson(json))).toEqual([]);
  });

  test("a well-formed file with no coursework is a success, not a failure", () => {
    const result = parseCanvasJson(JSON.stringify({ title: "Empty", assignments: [] }));

    expect(result.ok).toBe(true);
    expect(rows(result)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// .xml
// ---------------------------------------------------------------------------

describe("parseCanvasXml", () => {
  const manifest = `<?xml version="1.0"?>
    <manifest>
      <metadata><lom><general><title><string>Chemistry 110</string></title></general></lom></metadata>
      <resources>
        <resource><title>Titration writeup</title><description>Full method</description><due_at>2026-10-15T23:59:00Z</due_at></resource>
      </resources>
    </manifest>`;

  test("reads title, description and due date out of a manifest", () => {
    const result = parseCanvasXml(manifest, readXml);

    expect(rows(result)).toEqual([
      {
        title: "Titration writeup",
        subject: "Chemistry 110",
        description: "Full method",
        due_date: "2026-10-15T23:59:00.000Z",
        priority: "low",
      },
    ]);
  });

  // Every XML row used to import as "Imported" because no subject was passed at
  // all, leaving the student to re-file the lot by hand.
  test("files rows under the course named in the manifest metadata", () => {
    expect(rows(parseCanvasXml(manifest, readXml))[0].subject).toBe("Chemistry 110");
  });

  test("falls back to a title attribute when there is no title element", () => {
    const xml = `<?xml version="1.0"?><manifest><item title="Worksheet"><due_at>2026-10-15T23:59:00Z</due_at></item></manifest>`;

    expect(titles(parseCanvasXml(xml, readXml))).toEqual(["Worksheet"]);
  });

  // parseFromString does not throw; it returns a <parsererror> document that
  // matches none of the selectors. That used to surface as "no assignments
  // found in file", pointing the student at an export that was fine.
  test("reports malformed XML as malformed, not as empty", () => {
    const result = parseCanvasXml("<manifest><item></manifest>", readXml);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.kind).toBe("invalid-xml");
  });

  test("valid XML holding no assignments is a success with nothing in it", () => {
    const result = parseCanvasXml('<?xml version="1.0"?><manifest><resources /></manifest>', readXml);

    expect(result.ok).toBe(true);
    expect(rows(result)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Shared normalisation
// ---------------------------------------------------------------------------

describe("normalisation", () => {
  test("keeps the time of day rather than truncating to a date", () => {
    const result = parseCanvasJson(JSON.stringify([{ title: "Essay", subject: "S", due_at: "2026-11-02T14:30:00Z" }]));

    expect(rows(result)[0].due_date).toBe("2026-11-02T14:30:00.000Z");
  });

  test("drops an item with no title", () => {
    const result = parseCanvasJson(JSON.stringify([{ subject: "S", due_at: "2026-11-02T14:30:00Z" }]));

    expect(rows(result)).toEqual([]);
  });

  test("drops an item with no due date", () => {
    const result = parseCanvasJson(JSON.stringify([{ title: "Essay", subject: "S" }]));

    expect(rows(result)).toEqual([]);
  });

  test("drops an item whose due date cannot be read", () => {
    const result = parseCanvasJson(JSON.stringify([{ title: "Essay", subject: "S", due_at: "sometime next week" }]));

    expect(rows(result)).toEqual([]);
  });

  test("collapses the same assignment listed twice in one export", () => {
    const result = parseCanvasJson(
      JSON.stringify({
        title: "History 101",
        modules: [{ items: [{ type: "Assignment", title: "Essay", dueAt: "2026-11-02T23:59:00Z" }] }],
        assignments: [{ title: "Essay", dueAt: "2026-11-02T23:59:00Z" }],
      }),
    );

    expect(titles(result)).toEqual(["Essay"]);
  });

  // The dedupe key was title + due date only. Two courses that both set
  // "Reading" for Friday merged into one row, and the student lost an
  // assignment without ever being told.
  test("keeps two courses' identically-named assignments apart", () => {
    const result = parseCanvasJson(
      JSON.stringify([
        { title: "Reading", course_name: "History", due_at: "2026-11-02T23:59:00Z" },
        { title: "Reading", course_name: "Biology", due_at: "2026-11-02T23:59:00Z" },
      ]),
    );

    expect(rows(result).map((a) => a.subject)).toEqual(["History", "Biology"]);
  });

  test("treats a subject differing only in case or padding as the same one", () => {
    const result = parseCanvasJson(
      JSON.stringify([
        { title: "Reading", course_name: "History", due_at: "2026-11-02T23:59:00Z" },
        { title: "reading ", course_name: " HISTORY", due_at: "2026-11-02T23:59:00Z" },
      ]),
    );

    expect(rows(result)).toHaveLength(1);
  });

  test("falls back to Imported when nothing names the course", () => {
    const result = parseCanvasJson(JSON.stringify([{ title: "Essay", due_at: "2026-11-02T23:59:00Z" }]));

    expect(rows(result)[0].subject).toBe("Imported");
  });

  test("stores a description as text rather than the HTML Canvas sent", () => {
    const result = parseCanvasJson(
      JSON.stringify([
        { title: "Essay", subject: "S", due_at: "2026-11-02T23:59:00Z", description: "<p>Two pages.</p>" },
      ]),
    );

    expect(rows(result)[0].description).toBe("Two pages.");
  });
});

describe("plainDescription", () => {
  // Verbatim from a real sync, which is what reached the edit form as markup.
  test("turns a Canvas rich-editor description into paragraphs", () => {
    const html = `<p>Click on the file for a digital copy of the lab handout.&nbsp; This lab will be submitted on paper in class.</p>
<p><a class="instructure_file_link instructure_scribd_file inline_disabled" title="Ticker Tape Free Fall Lab 2024.pdf" href="https://harford.instructure.com/courses/160040/files/102832623?verifier=47c71059-05a8-491a-aaab-f22e03ef90b8&amp;wrap=1" target="_blank" data-canvas-previewable="false" data-api-endpoint="https://harford.instructure.com/api/v1/courses/160040/files/102832623" data-api-returntype="File">Acceleration Due to Gravity Lab File</a></p>`;

    expect(plainDescription(html)).toBe(
      "Click on the file for a digital copy of the lab handout. This lab will be submitted on paper in class.\n\n" +
        "Acceleration Due to Gravity Lab File (https://harford.instructure.com/courses/160040/files/102832623?verifier=47c71059-05a8-491a-aaab-f22e03ef90b8&wrap=1)",
    );
  });

  test("leaves text with no markup in it alone", () => {
    expect(plainDescription("  Exercises 1-20, show work.\nDue in class.  ")).toBe(
      "Exercises 1-20, show work.\nDue in class.",
    );
    expect(plainDescription("x < y and y > z")).toBe("x < y and y > z");
  });

  test.each([[null], [undefined], [""], ["<p>&nbsp;</p>"], ["<div><br></div>"]])(
    "reads %p as no description",
    (raw) => {
      expect(plainDescription(raw)).toBeNull();
    },
  );

  test("puts each list item on its own line, numbering an ordered list", () => {
    const html = "<p>Bring:</p><ul><li>Goggles</li><li>Notebook</li></ul><ol><li>Drop</li><li>Measure</li></ol>";

    expect(plainDescription(html)).toBe("Bring:\n\n• Goggles\n• Notebook\n\n1. Drop\n2. Measure");
  });

  test("breaks lines at <br> and table rows", () => {
    expect(plainDescription("Line one<br>Line two")).toBe("Line one\nLine two");
    expect(
      plainDescription("<table><tr><td>Part A</td><td>10 pts</td></tr><tr><td>Part B</td><td>5 pts</td></tr></table>"),
    ).toBe("Part A 10 pts\nPart B 5 pts");
  });

  test("does not print an address twice, or one that only works inside Canvas", () => {
    expect(plainDescription('<p><a href="https://example.com/">https://example.com</a></p>')).toBe(
      "https://example.com",
    );
    expect(plainDescription('<p>See <a href="/courses/1/pages/rubric">the rubric</a>.</p>')).toBe("See the rubric.");
  });

  test("drops scripts, styles and comments with their contents", () => {
    expect(
      plainDescription("<style>p { color: red }</style><!-- note --><p>Read ch. 4</p><script>alert(1)</script>"),
    ).toBe("Read ch. 4");
  });

  test("decodes entities once, and leaves unknown ones as written", () => {
    expect(plainDescription("<p>Q&amp;A &ndash; &lt;b&gt; &#8217; &#x2019; &amp;lt; &bogus; &constructor;</p>")).toBe(
      "Q&A – <b> ’ ’ &lt; &bogus; &constructor;",
    );
  });
});

describe("canvasPriority", () => {
  test.each([
    [10, "high"],
    [5, "high"],
    [4, "medium"],
    [3, "medium"],
    [2.9, "low"],
    [0, "low"],
  ] as const)("maps %p points to %s", (points, expected) => {
    expect(canvasPriority({ pointsPossible: points })).toBe(expected);
  });

  test("prefers an explicit priority over the points", () => {
    expect(canvasPriority({ pointsPossible: 100, priority: "low" })).toBe("low");
  });

  test("treats missing or unusable points as low", () => {
    expect(canvasPriority({})).toBe("low");
    expect(canvasPriority({ pointsPossible: Number.NaN })).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

describe("detectAndParse", () => {
  test("routes each accepted extension to its parser", () => {
    expect(
      titles(
        detectAndParse(
          "course-data.js",
          'window.COURSE_DATA = {"title":"A","assignments":[{"title":"T","dueAt":"2026-10-01T12:00:00Z"}]};',
        ),
      ),
    ).toEqual(["T"]);
    expect(titles(detectAndParse("export.json", '[{"title":"T","due_at":"2026-10-01T12:00:00Z"}]'))).toEqual(["T"]);
    expect(
      titles(
        detectAndParse(
          "imsmanifest.xml",
          '<?xml version="1.0"?><manifest><item title="T"><due_at>2026-10-01T12:00:00Z</due_at></item></manifest>',
          readXml,
        ),
      ),
    ).toEqual(["T"]);
  });

  test("matches the extension regardless of case", () => {
    expect(titles(detectAndParse("EXPORT.JSON", '[{"title":"T","due_at":"2026-10-01T12:00:00Z"}]'))).toEqual(["T"]);
  });

  // Removing the CSV and .imscc parsers left the chain of `if`s with no final
  // `else`, so those files reported "no assignments found in file" — which reads
  // as "your export is empty", not "this app cannot open that".
  test.each([[".csv"], [".imscc"], [".txt"], [".zip"]])("names %s as an unsupported format", (extension) => {
    const result = detectAndParse(`export${extension}`, "anything at all");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.kind).toBe("unsupported-format");
      expect(describeParseFailure(result.reason)).toContain(extension);
    }
  });

  test("handles a file with no extension", () => {
    const result = detectAndParse("course-data", "anything at all");

    expect(result.ok).toBe(false);
  });

  test("every accepted extension is one detectAndParse actually routes", () => {
    for (const extension of ACCEPTED_EXTENSIONS) {
      const result = detectAndParse(`file${extension}`, "", readXml);
      const unsupported = !result.ok && result.reason.kind === "unsupported-format";
      expect(unsupported).toBe(false);
    }
  });
});

describe("describeParseFailure", () => {
  test.each([
    [{ kind: "unsupported-format", extension: ".csv" } as const],
    [{ kind: "invalid-json", message: "boom" } as const],
    [{ kind: "invalid-xml" } as const],
    [{ kind: "no-course-data" } as const],
  ])("gives $kind a message the user can act on", (reason) => {
    const message = describeParseFailure(reason);

    expect(message.length).toBeGreaterThan(20);
    expect(message).not.toContain("undefined");
  });
});
