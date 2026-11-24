import type { Page } from '@/payload-types'

type LexicalState = NonNullable<Page['content']>

export type LexicalBlock = { type: 'h2' | 'p'; text: string }

const textNode = (text: string) => ({
  type: 'text',
  version: 1,
  text,
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
})

const blockNode = (block: LexicalBlock) => {
  const base = {
    version: 1,
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    children: [textNode(block.text)],
  }
  return block.type === 'h2'
    ? { ...base, type: 'heading', tag: 'h2' }
    : { ...base, type: 'paragraph', textFormat: 0, textStyle: '' }
}

/** Builds a minimal valid Lexical editor state from headings and paragraphs. */
export function lexicalDoc(blocks: LexicalBlock[]): LexicalState {
  return {
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: blocks.map(blockNode),
    },
  } as LexicalState
}
