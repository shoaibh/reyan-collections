import { RichText as LexicalRichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import React from 'react'

export function RichText({ data }: { data?: SerializedEditorState | null }) {
  if (!data) return null
  return (
    <LexicalRichText
      data={data}
      className="space-y-3 text-base leading-relaxed [&_h2]:text-xl [&_h2]:font-extrabold [&_h3]:text-lg [&_h3]:font-bold [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
    />
  )
}
