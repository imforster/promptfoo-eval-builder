import { useEffect, useId, useLayoutEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from "react";
import { BrowserOpenURL } from "../wailsjs/runtime/runtime";
import { ASSERTION_GROUPS, ASSERTION_TYPES, NEGATE_PREFIX, assertionInfo, splitNegation } from "./catalog";
import { emptyAssertion, type Assertion, type KV, type TestCase } from "./types";

export function update<T>(list: T[], index: number, value: T): T[] {
  return list.map((item, i) => (i === index ? value : item));
}

export function remove<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

export function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

export function Field(props: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  );
}

/** Opens in the system browser; a plain link would navigate the app's own window. */
export function ExternalLink(props: { href: string; children: ReactNode }) {
  return (
    <a
      href={props.href}
      onClick={(e) => {
        e.preventDefault();
        BrowserOpenURL(props.href);
      }}
    >
      {props.children}
    </a>
  );
}

/**
 * A textarea that grows to fit its text, wrapped lines included, from `rows` up to
 * a CSS max-height (then it scrolls).
 */
export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const style = getComputedStyle(el);
    const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const padding =
      style.boxSizing === "border-box" ? 0 : -(parseFloat(style.paddingTop) + parseFloat(style.paddingBottom));
    el.style.height = `${el.scrollHeight + (style.boxSizing === "border-box" ? borders : 0) + padding}px`;
    // Scroll only once max-height caps the box.
    el.style.overflowY = el.scrollHeight > el.clientHeight + 1 ? "auto" : "hidden";
  };
  useLayoutEffect(fit, [props.value]);
  // Re-fit when the width changes, since that changes where lines wrap.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fit();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <textarea {...props} ref={ref} className={`auto-grow ${props.className ?? ""}`} />;
}

export function IconButton(props: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="icon-button"
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}

export function RowActions(props: {
  noun: string;
  index: number;
  count: number;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onDuplicate?: () => void;
}) {
  return (
    <div className="row-actions">
      <IconButton label={`Move ${props.noun} up`} onClick={() => props.onMove(-1)} disabled={props.index === 0}>
        ↑
      </IconButton>
      <IconButton
        label={`Move ${props.noun} down`}
        onClick={() => props.onMove(1)}
        disabled={props.index === props.count - 1}
      >
        ↓
      </IconButton>
      {props.onDuplicate && (
        <IconButton label={`Duplicate ${props.noun}`} onClick={props.onDuplicate}>
          ⧉
        </IconButton>
      )}
      <IconButton label={`Remove ${props.noun}`} onClick={props.onRemove}>
        ✕
      </IconButton>
    </div>
  );
}

export function KVEditor(props: {
  rows: KV[];
  onChange: (rows: KV[]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
  addLabel: string;
  keySuggestions?: string[];
  /** Keys that are always shown, even before a value is entered. */
  pinnedKeys?: string[];
}) {
  const listId = useId();
  const pinned = (props.pinnedKeys ?? []).filter((k) => !props.rows.some((r) => r.key === k));
  const setPinned = (key: string, value: string) => props.onChange([...props.rows, { key, value }]);

  return (
    <div className="kv">
      {props.keySuggestions && (
        <datalist id={listId}>
          {props.keySuggestions.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      )}
      {props.rows.map((row, i) => {
        const isPinned = props.pinnedKeys?.includes(row.key);
        return (
          <div className="kv-row" key={i}>
            <input
              className="kv-key"
              value={row.key}
              placeholder={props.keyPlaceholder}
              list={props.keySuggestions ? listId : undefined}
              readOnly={isPinned}
              onChange={(e) => props.onChange(update(props.rows, i, { ...row, key: e.target.value }))}
            />
            <AutoTextarea
              className="kv-value"
              rows={1}
              value={row.value}
              placeholder={props.valuePlaceholder}
              onChange={(e) => props.onChange(update(props.rows, i, { ...row, value: e.target.value }))}
            />
            <IconButton label="Remove" onClick={() => props.onChange(remove(props.rows, i))}>
              ✕
            </IconButton>
          </div>
        );
      })}
      {pinned.map((key) => (
        <div className="kv-row" key={`pinned-${key}`}>
          <input className="kv-key" value={key} readOnly />
          <AutoTextarea
            className="kv-value"
            rows={1}
            value=""
            placeholder={props.valuePlaceholder}
            onChange={(e) => setPinned(key, e.target.value)}
          />
          <span className="icon-spacer" />
        </div>
      ))}
      <button
        type="button"
        className="link-button"
        onClick={() => props.onChange([...props.rows, { key: "", value: "" }])}
      >
        + {props.addLabel}
      </button>
    </div>
  );
}

export function AssertionList(props: { asserts: Assertion[]; onChange: (asserts: Assertion[]) => void }) {
  const { asserts, onChange } = props;
  return (
    <div className="assertions">
      {asserts.length === 0 && <p className="muted">No assertions yet.</p>}
      {asserts.map((a, i) => (
        <AssertionEditor
          key={i}
          assertion={a}
          onChange={(next) => onChange(update(asserts, i, next))}
          actions={
            <RowActions
              noun="assertion"
              index={i}
              count={asserts.length}
              onMove={(d) => onChange(move(asserts, i, d))}
              onRemove={() => onChange(remove(asserts, i))}
            />
          }
        />
      ))}
      <button type="button" className="link-button" onClick={() => onChange([...asserts, emptyAssertion()])}>
        + Add assertion
      </button>
    </div>
  );
}

function AssertionEditor(props: { assertion: Assertion; onChange: (a: Assertion) => void; actions: ReactNode }) {
  const a = props.assertion;
  const set = (patch: Partial<Assertion>) => props.onChange({ ...a, ...patch });
  const { negated, base } = splitNegation(a.type);
  const info = assertionInfo(a.type);
  const known = info !== undefined;
  const valueKind = info?.value ?? "text";
  const showThreshold = !known || info.threshold || a.threshold !== "";
  const config = a.config ?? [];
  const showConfig = valueKind === "code" || config.length > 0;

  return (
    <div className="assertion">
      <div className="assertion-head">
        <select
          value={known ? base : "__custom"}
          onChange={(e) => {
            const next = e.target.value === "__custom" ? "" : e.target.value;
            set({ type: (negated ? NEGATE_PREFIX : "") + next });
          }}
          aria-label="Assertion type"
        >
          {ASSERTION_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {ASSERTION_TYPES.filter((t) => t.group === g).map((t) => (
                <option key={t.type} value={t.type}>
                  {t.type}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="__custom">Other…</option>
        </select>
        {!known && (
          <input
            value={base}
            placeholder="assertion type"
            onChange={(e) => set({ type: (negated ? NEGATE_PREFIX : "") + e.target.value })}
          />
        )}
        <label className="checkbox" title="Prefix the type with not- to invert the check">
          <input
            type="checkbox"
            checked={negated}
            onChange={(e) => set({ type: (e.target.checked ? NEGATE_PREFIX : "") + base })}
          />
          Negate
        </label>
        <span className="spacer" />
        {props.actions}
      </div>
      {info && <p className="field-hint">{info.hint}</p>}
      <div className="assertion-body">
        {valueKind !== "none" || a.value !== "" ? (
          <AssertionValue kind={valueKind} value={a.value} onChange={(value) => set({ value })} />
        ) : null}
        <div className="assertion-numbers">
          {showThreshold && (
            <Field label={info?.thresholdRequired ? "Threshold" : "Threshold (optional)"}>
              <input
                inputMode="decimal"
                value={a.threshold}
                placeholder={info?.type === "latency" ? "ms, e.g. 3000" : "e.g. 0.8"}
                onChange={(e) => set({ threshold: e.target.value })}
              />
            </Field>
          )}
          <Field label="Weight">
            <input
              inputMode="decimal"
              value={a.weight}
              placeholder="1"
              onChange={(e) => set({ weight: e.target.value })}
            />
          </Field>
          <Field label="Metric name">
            <input value={a.metric} placeholder="optional" onChange={(e) => set({ metric: e.target.value })} />
          </Field>
        </div>
        {showConfig && (
          <div className="assertion-config">
            <span className="field-label">Config</span>
            <span className="field-hint">
              Passed to the script as <code>context.config</code>, e.g. <code>schemaPath</code> for the kit’s
              matchSchema check.
            </span>
            <KVEditor
              rows={config}
              onChange={(rows) => set({ config: rows })}
              keyPlaceholder="key"
              valuePlaceholder="value"
              addLabel="Add config value"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function AssertionValue(props: { kind: string; value: string; onChange: (v: string) => void }) {
  if (props.kind === "list") {
    return (
      <Field label="Values" hint="One per line.">
        <AutoTextarea
          rows={3}
          value={listToLines(props.value)}
          onChange={(e) => props.onChange(linesToList(e.target.value))}
        />
      </Field>
    );
  }
  const multiline = props.kind === "code" || props.kind === "rubric";
  const label =
    props.kind === "rubric" ? "Rubric / criteria" : props.kind === "code" ? "Code or file:// path" : "Value";
  return (
    <Field label={label} hint={multiline ? undefined : "Use {{var}} to reference test variables."}>
      <AutoTextarea
        className={props.kind === "code" ? "mono" : undefined}
        rows={multiline ? 3 : 1}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </Field>
  );
}

function listToLines(value: string): string {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String).join("\n");
  } catch {
    // Not JSON yet; show as-is.
  }
  return value;
}

function linesToList(text: string): string {
  // Keep a trailing empty line so the user can keep typing a new entry.
  const lines = text.split("\n");
  return lines.length === 1 && lines[0] === "" ? "" : JSON.stringify(lines);
}

export function TestCaseFields(props: {
  test: TestCase;
  onChange: (t: TestCase) => void;
  promptVars: string[];
  showDescription?: boolean;
}) {
  const t = props.test;
  return (
    <div className="test-fields">
      {props.showDescription !== false && (
        <Field label="Description">
          <input
            value={t.description}
            placeholder="What does this test check?"
            onChange={(e) => props.onChange({ ...t, description: e.target.value })}
          />
        </Field>
      )}
      <h4>Variables</h4>
      <KVEditor
        rows={t.vars}
        onChange={(vars) => props.onChange({ ...t, vars })}
        keyPlaceholder="name"
        valuePlaceholder="value (JSON array to test several values)"
        addLabel="Add variable"
        keySuggestions={props.promptVars}
        pinnedKeys={props.promptVars}
      />
      <h4>Assertions</h4>
      <AssertionList asserts={t.assert} onChange={(assert) => props.onChange({ ...t, assert })} />
    </div>
  );
}
