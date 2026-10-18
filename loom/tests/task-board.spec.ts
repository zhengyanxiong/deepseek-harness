import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { TaskBoard } from '../src/client/TaskBoard.tsx'
import { en } from '../src/client/locales.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { BoardTask } from '../src/client/board.ts'
it('renders five labeled business columns and a real task selection button', () => {
  const task: BoardTask = { id: brandString<BoardTask['id']>('t1'), versionId: brandString<BoardTask['versionId']>('v1'), title: '<Checkout>', status: 'pending', attempts: [] }
  const html = renderToStaticMarkup(createElement(TaskBoard, { tasks: [task], filter: {}, t: key => en[key], onSelect: () => {} }))
  for (const label of ['Pending', 'Running', 'In review', 'Completed', 'Failed']) expect(html).toContain(label)
  expect(html).toContain('&lt;Checkout&gt;')
  expect(html).toContain('<button')
})
