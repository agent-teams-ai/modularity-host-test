// Fixed types for task (a). Do not edit; check.sh uses its own copy.
import type { ReadonlyStore } from "@get-modular/observation";

export type LogLevel = "debug" | "info" | "warn" | "error";
/** The logger's own slice of the settings. The Host passes a facet of a wider settings store. */
export type LoggingSettings = { readonly logLevel: LogLevel };
export type LoggerDeps = { readonly settings: ReadonlyStore<LoggingSettings> };
export type LoggerPort = { readonly log: (level: LogLevel, message: string) => undefined };

/** An existing adapter: writes messages at or above its threshold. */
export type ConsoleSink = {
  readonly setThreshold: (level: LogLevel) => void;
  readonly write: (level: LogLevel, message: string) => void;
};
export declare function createConsoleSink(threshold: LogLevel): ConsoleSink;

export type LoggerProduct = { readonly instance: ConsoleSink; readonly capabilities: { readonly "acme/logger": LoggerPort } };
