import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { actions, useStore } from "../store";
import { buildIndex, isEntity, unlinkedMentions } from "../project/links";
import { sectionFor, type Doc, type Status } from "../project/model";

/** Right-hand panel: metadata for the open doc and how it connects to the rest. */
export function Inspector({ doc }: { doc: Doc }) {
  const project = useStore((s) => s.project)!;
  const index = useMemo(() => buildIndex(project), [project]);

  return (
    <aside className="inspector" aria-label="Inspector">
      {isEntity(doc) ? <EntityFields doc={doc} /> : <ChapterFields doc={doc} />}

      {doc.kind === "manuscript" ? (
        <Group title="In this chapter" empty="No links yet. Type [[ while writing.">
          {(index.outlinks.get(doc.id) ?? []).map((d) => (
            <button key={d.id} className="chip" data-kind={d.kind} onClick={() => void actions.openDoc(d.id)}>
              {d.title}
            </button>
          ))}
        </Group>
      ) : (
        <Group title="Appears in" empty="Nothing links here yet.">
          {(index.backlinks.get(doc.id) ?? []).map((m) => (
            <button key={m.source.id} className="mention" onClick={() => void actions.openDoc(m.source.id)}>
              <span className="mention-head">
                <span className="dot" data-kind={m.source.kind} />
                {m.source.title}
                {m.count > 1 ? <span className="count">×{m.count}</span> : null}
              </span>
              <span className="mention-excerpt">{m.excerpt}</span>
            </button>
          ))}
        </Group>
      )}

      {isEntity(doc) && <UnlinkedMentions doc={doc} />}

      {(index.unresolved.get(doc.id) ?? []).length > 0 && (
        <Group title="Not created yet">
          {index.unresolved.get(doc.id)!.map((name) => (
            <div key={name} className="unresolved">
              <span>{name}</span>
              <span className="unresolved-actions">
                {(["character", "location", "item"] as const).map((kind) => (
                  <button key={kind} title={`Create ${kind}`} onClick={() => void actions.createDoc(kind, name, false)}>
                    + {sectionFor(kind).singular}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </Group>
      )}
    </aside>
  );
}

function UnlinkedMentions({ doc }: { doc: Doc }) {
  const project = useStore((s) => s.project)!;
  const mentions = useMemo(() => unlinkedMentions(project, doc), [project, doc]);
  if (!mentions.length) return null;
  return (
    <Group title="Unlinked mentions">
      {mentions.map((m) => (
        <div key={m.source.id} className="mention">
          <span className="mention-head">
            <button className="link-btn" onClick={() => void actions.openDoc(m.source.id)}>
              {m.source.title}
            </button>
            <button className="small-btn" onClick={() => void actions.linkMentionsIn(m.source.id, doc.id)}>
              Link {m.count > 1 ? `all ${m.count}` : ""}
            </button>
          </span>
          <span className="mention-excerpt">{m.excerpt}</span>
        </div>
      ))}
    </Group>
  );
}

function ChapterFields({ doc }: { doc: Doc }) {
  return (
    <div className="fields">
      <Field label="Synopsis" multiline value={String(doc.meta.synopsis ?? "")} onCommit={(v) => actions.updateMeta(doc.id, { synopsis: v })} />
      <label className="field">
        <span>Status</span>
        <select
          value={doc.meta.status ?? ""}
          onChange={(e) => actions.updateMeta(doc.id, { status: (e.currentTarget.value || undefined) as Status | undefined })}
        >
          <option value="">—</option>
          <option value="draft">Draft</option>
          <option value="revised">Revised</option>
          <option value="final">Final</option>
        </select>
      </label>
    </div>
  );
}

function EntityFields({ doc }: { doc: Doc }) {
  const aliases = Array.isArray(doc.meta.aliases) ? doc.meta.aliases.join(", ") : "";
  return (
    <div className="fields">
      <div className="kind-label" data-kind={doc.kind}>
        {sectionFor(doc.kind).singular}
      </div>
      <Field label="Summary" multiline value={String(doc.meta.summary ?? "")} onCommit={(v) => actions.updateMeta(doc.id, { summary: v })} />
      <Field
        label="Also known as"
        placeholder="Comma-separated, e.g. Mara, the girl"
        value={aliases}
        onCommit={(v) =>
          actions.updateMeta(doc.id, {
            aliases: v.split(",").map((a) => a.trim()).filter(Boolean),
          })
        }
      />
    </div>
  );
}

function Field(props: { label: string; value: string; multiline?: boolean; placeholder?: string; onCommit: (v: string) => void }) {
  const [value, setValue] = useState(props.value);
  useEffect(() => setValue(props.value), [props.value]);
  const common = {
    value,
    placeholder: props.placeholder,
    onInput: (e: { currentTarget: { value: string } }) => setValue(e.currentTarget.value),
    onBlur: () => value !== props.value && props.onCommit(value.trim()),
  };
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.multiline ? <textarea rows={3} {...common} /> : <input {...common} />}
    </label>
  );
}

function Group({ title, empty, children }: { title: string; empty?: string; children: ComponentChildren }) {
  const has = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="group">
      <h3>{title}</h3>
      {has ? <div className="group-body">{children}</div> : <p className="empty">{empty}</p>}
    </section>
  );
}
