import type { ModuleContext } from "@get-modular/resources";
import { createConsoleSink, type LoggerDeps, type LoggerProduct } from "./a-logger.types.js";

export async function createLoggerModule(deps: LoggerDeps, { resources }: ModuleContext): Promise<LoggerProduct> {
  const level = deps.settings.read(["logLevel"]);
  const sink = createConsoleSink(level.values.logLevel);
  deps.settings.watch(level, {
    resources, name: "logger/level",
    onChange: ({ values }) => { sink.setThreshold(values.logLevel); },
  });
  return {
    instance: sink,
    capabilities: { "acme/logger": { log: (logLevel, message) => { sink.write(logLevel, message); return undefined; } } },
  };
}
