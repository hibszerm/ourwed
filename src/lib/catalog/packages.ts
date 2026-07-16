import type { Package } from '@/types/package'

/** Studio package catalog — used until packages live in Supabase. */
export const studioPackages: Package[] = [
  {
    id: 'p1',
    name: 'Premium Full Day',
    price: 45000,
    color: '#7c5cbf',
    deliverables: [
      { id: 'pd-teaser', name: 'Teaser' },
      { id: 'pd-full-film', name: 'Film główny' },
      { id: 'pd-highlight', name: 'Film highlightowy' },
      { id: 'pd-gallery', name: 'Galeria online' },
      { id: 'pd-usb', name: 'USB' },
    ],
  },
  {
    id: 'p2',
    name: 'Film Documentary',
    price: 32000,
    color: '#5c8f7c',
    deliverables: [
      { id: 'pd-teaser', name: 'Teaser' },
      { id: 'pd-full-film', name: 'Film główny' },
      { id: 'pd-highlight', name: 'Film highlightowy' },
      { id: 'pd-usb', name: 'USB' },
    ],
  },
  {
    id: 'p3',
    name: 'Photo + Film Signature',
    price: 58000,
    color: '#5c7cbf',
    deliverables: [
      { id: 'pd-teaser', name: 'Teaser' },
      { id: 'pd-full-film', name: 'Film główny' },
      { id: 'pd-highlight', name: 'Film highlightowy' },
      { id: 'pd-gallery', name: 'Galeria online' },
      { id: 'pd-album', name: 'Album' },
      { id: 'pd-usb', name: 'USB' },
      { id: 'pd-reel', name: 'Instagram Reel' },
    ],
  },
  {
    id: 'p4',
    name: 'Classic Film',
    price: 28000,
    color: '#bf7c5c',
    deliverables: [
      { id: 'pd-teaser', name: 'Teaser' },
      { id: 'pd-full-film', name: 'Film główny' },
      { id: 'pd-usb', name: 'USB' },
    ],
  },
  {
    id: 'p5',
    name: 'Photo Premium',
    price: 52000,
    color: '#8f5c7c',
    deliverables: [
      { id: 'pd-gallery', name: 'Galeria online' },
      { id: 'pd-usb', name: 'USB' },
      { id: 'pd-album', name: 'Album' },
    ],
  },
]
