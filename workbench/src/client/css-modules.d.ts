/** Typed import for hashed CSS Modules classes (emitted by the tsdown CSS plugin). */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
