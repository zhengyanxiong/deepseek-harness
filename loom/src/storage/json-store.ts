/** Instance-serialized JSON persistence; atomic rename does not provide cross-process locking. */
import { randomUUID } from 'node:crypto'
import { open, readFile, rename, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

/** Persistence failures retain their original cause for diagnostics. */
export class JsonStoreError extends Error {
  constructor(readonly code: 'missing' | 'read_failed' | 'corrupt' | 'write_failed', readonly file: string, cause: unknown) {
    super(`${code}: ${file}`, { cause })
    this.name = 'JsonStoreError'
  }
}

/** Input parser owns data schema validation and migrations are explicit. */
export interface JsonStoreOptions<T> {
  readonly file: string
  readonly version: number
  readonly parse: (value: unknown) => T
  readonly stringify?: (value: unknown) => string
}

/** Snapshots are detached copies; unsuccessful operations never publish new state. */
export interface JsonStore<T> {
  load(): Promise<T>
  write(value: T): Promise<void>
  snapshot(): T | undefined
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

/** Create a store for one file. Its parent directory must already exist.
 * @param options - Absolute or cwd-relative file, positive schema version and validating parser.
 * @returns a store that serializes loads and writes within this instance only.
 */
export function createJsonStore<T>(options: JsonStoreOptions<T>): JsonStore<T> {
  if (!Number.isSafeInteger(options.version) || options.version < 1) throw new RangeError('version must be a positive safe integer')
  const file = resolve(options.file)
  const stringify = options.stringify ?? JSON.stringify
  let state: T | undefined
  let queue: Promise<void> = Promise.resolve()

  function enqueue<R>(operation: () => Promise<R>): Promise<R> {
    const result = queue.then(operation)
    queue = result.then(() => undefined, () => undefined)
    return result
  }

  function decode(text: string): T {
    const envelope: unknown = JSON.parse(text)
    if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)
      || !('schema' in envelope) || envelope.schema !== 'loom-json-store'
      || !('version' in envelope) || envelope.version !== options.version || !('data' in envelope)) {
      throw new Error('invalid schema envelope')
    }
    return structuredClone(options.parse(envelope.data))
  }

  return {
    snapshot: () => state === undefined ? undefined : structuredClone(state),
    load: () => enqueue(async () => {
      let text: string
      try {
        text = await readFile(file, 'utf8')
      } catch (error) {
        throw new JsonStoreError(hasCode(error, 'ENOENT') ? 'missing' : 'read_failed', file, error)
      }
      let loaded: T
      try {
        loaded = decode(text)
      } catch (error) {
        throw new JsonStoreError('corrupt', file, error)
      }
      state = loaded
      return structuredClone(loaded)
    }),
    write: (value: T) => {
      // Capture at invocation, not after prior operations yield, so callers retain no mutable alias.
      let text: string
      let candidate: T
      try {
        text = stringify({ schema: 'loom-json-store', version: options.version, data: options.parse(structuredClone(value)) })
        candidate = decode(text)
      } catch (error) {
        return Promise.reject(new JsonStoreError('write_failed', file, error))
      }
      return enqueue(async () => {
        const temporary = join(dirname(file), `.loom-${randomUUID()}.tmp`)
        let created = false
        try {
          const handle = await open(temporary, 'wx', 0o600)
          created = true
          try {
            await handle.writeFile(text + '\n', 'utf8')
          } finally {
            await handle.close()
          }
          await rename(temporary, file)
        } catch (error) {
          // Only the exact temporary path this operation successfully created may be removed.
          if (created) {
            try {
              await unlink(temporary)
            } catch (cleanupError) {
              throw new JsonStoreError('write_failed', file, new AggregateError([error, cleanupError], 'write and temporary cleanup failed'))
            }
          }
          throw new JsonStoreError('write_failed', file, error)
        }
        state = candidate
      })
    },
  }
}
