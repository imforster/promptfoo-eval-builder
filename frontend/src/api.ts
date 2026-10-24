import * as App from "../wailsjs/go/main/App";
import { EventsOn } from "../wailsjs/runtime/runtime";
import type { Config, Example, KitStatus, PromptFile, ToolchainStatus } from "./types";

// The generated bindings use classes; our plain objects are structurally identical.
type AnyConfig = Parameters<typeof App.ToYAML>[0];
const toGo = (c: Config) => c as unknown as AnyConfig;

export const api = {
  newConfig: () => App.NewConfig() as unknown as Promise<Config>,
  toYAML: (c: Config) => App.ToYAML(toGo(c)),
  fromYAML: (text: string) => App.FromYAML(text) as unknown as Promise<Config>,
  openFile: () => App.OpenFile() as unknown as Promise<{ path: string; config: Config }>,
  save: (c: Config, path: string) => App.Save(toGo(c), path),
  copyYAML: (c: Config) => App.CopyYAML(toGo(c)),
  confirm: (title: string, message: string, ok: string) => App.Confirm(title, message, ok),
  alert: (title: string, message: unknown) => App.Alert(title, String(message)),
  listExamples: () => App.ListExamples() as Promise<Example[]>,
  loadExample: (id: string) => App.LoadExample(id) as unknown as Promise<Config>,
  promptFiles: (path: string, raw: string) => App.PromptFiles(path, raw) as Promise<PromptFile[]>,
  pickPromptFile: (configPath: string) => App.PickPromptFile(configPath),
  openInDefaultApp: (path: string) => App.OpenInDefaultApp(path),
  toolchainStatus: () => App.ToolchainStatus() as Promise<ToolchainStatus>,
  installNode: () => App.InstallNode(),
  installPromptfoo: () => App.InstallPromptfoo(),
  kitStatus: (path: string, c: Config) => App.KitStatus(path, toGo(c)) as Promise<KitStatus>,
  installKit: (path: string) => App.InstallKit(path),
  installDeps: (path: string) => App.InstallDeps(path),
  runEval: (path: string, noCache: boolean) => App.RunEval(path, noCache),
  stopEval: () => App.StopEval(),
  viewResults: (path: string) => App.ViewResults(path),
  onEvalOutput: (cb: (line: string) => void) => EventsOn("eval:output", cb),
  onEvalDone: (cb: (error: string) => void) => EventsOn("eval:done", cb),
};
