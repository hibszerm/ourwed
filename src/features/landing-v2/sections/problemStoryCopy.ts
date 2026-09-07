/**
 * Exact Problem Story copy — do not rewrite.
 * `lines` = mobile / static semantic breaks.
 * `desktopLines` = explicit desktop line architecture (max 2 lines).
 */
export const PROBLEM_STORY_SCENES = [
  {
    id: '01',
    lines: ['Jedno zlecenie.', 'Dziesiątki rzeczy do dopilnowania.'],
    desktopLines: ['Jedno zlecenie.', 'Dziesiątki rzeczy do dopilnowania.'],
  },
  {
    id: '02',
    lines: ['Umowa w plikach.', 'Ustalenia w wiadomościach.'],
    desktopLines: ['Umowa w plikach.', 'Ustalenia w wiadomościach.'],
  },
  {
    id: '03',
    lines: ['Płatności w Excelu.', 'Terminy w kalendarzu.'],
    desktopLines: ['Płatności w Excelu.', 'Terminy w kalendarzu.'],
  },
  {
    id: '04',
    lines: ['Plan dnia gdzieś w mailu.', 'Adresy wysłane na Instagramie.'],
    desktopLines: ['Plan dnia gdzieś w mailu.', 'Adresy wysłane na Instagramie.'],
  },
  {
    id: '05',
    lines: ['Wszystko dotyczy tego samego ślubu.'],
    desktopLines: ['Wszystko dotyczy tego samego ślubu.'],
    desktopLinesCompact: ['Wszystko dotyczy', 'tego samego ślubu.'],
  },
  {
    id: '06',
    lines: ['Dlatego w OurWed wszystko masz pod ręką.'],
    desktopLines: ['Dlatego w OurWed', 'wszystko masz pod ręką.'],
  },
  {
    id: '07',
    lines: ['Jedno miejsce.', 'Cały sezon.', 'Zero chaosu.'],
    desktopLines: ['Jedno miejsce. Cały sezon.', 'Zero chaosu.'],
  },
] as const

export type ProblemStorySceneId = (typeof PROBLEM_STORY_SCENES)[number]['id']

export const PROBLEM_STORY_SCENE_CLASS: Record<
  ProblemStorySceneId,
  `scene${ProblemStorySceneId}`
> = {
  '01': 'scene01',
  '02': 'scene02',
  '03': 'scene03',
  '04': 'scene04',
  '05': 'scene05',
  '06': 'scene06',
  '07': 'scene07',
}

/** Scenes 01–04 use muted tone on secondary lines. */
export function isProblemStoryMutedLine(sceneId: ProblemStorySceneId, lineIndex: number) {
  return (
    (sceneId === '01' ||
      sceneId === '02' ||
      sceneId === '03' ||
      sceneId === '04') &&
    lineIndex > 0
  )
}
