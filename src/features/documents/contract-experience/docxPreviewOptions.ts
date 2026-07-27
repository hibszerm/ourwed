/** Shared docx-preview options for production contract preview. */
export const DOCX_PREVIEW_OPTIONS = {
  inWrapper: true,
  ignoreWidth: false,
  ignoreHeight: false,
  ignoreFonts: false,
  breakPages: true,
  // false matches Word page breaks more closely in OurWed fixtures;
  // true can hide legitimate breaks from the template.
  ignoreLastRenderedPageBreak: false,
  experimental: true,
  renderHeaders: true,
  renderFooters: true,
  renderFootnotes: true,
  renderEndnotes: true,
  renderComments: false,
  useBase64URL: false,
  debug: false,
} as const
