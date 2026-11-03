import { useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../ShellContext'
import LessonsLearnedManager from '../components/LessonsLearnedManager'

export default function LessonsLearnedPage() {
  const { canEdit } = useOutletContext<ShellContext>()
  return <LessonsLearnedManager canEdit={canEdit} />
}
