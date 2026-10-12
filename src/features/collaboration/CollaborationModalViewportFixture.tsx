import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/tokens.css'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

export function CollaborationModalViewportFixture() {
  const [dialog, setDialog] = useState<'invite' | 'end' | null>(null)

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Współpraca</h1>
      <section aria-label="Zaproszenia przychodzące">
        <h2>Zaproszenia do współpracy</h2>
        <p>Fotograf A chce połączyć się z Tobą w OurWed.</p>
        <Button type="button" variant="ghost">Odrzuć</Button>
        <Button type="button" variant="primary">Akceptuj</Button>
      </section>
      <section aria-label="Zaproszenia wychodzące">
        <h2>Oczekujące</h2>
        <p>Fotograf B oczekuje na odpowiedź.</p>
        <Button type="button" variant="ghost">Anuluj</Button>
      </section>
      <section aria-label="Aktywni współpracownicy">
        <h2>Współpracownicy</h2>
        <p>Fotograf C · Połączono 12 października 2026</p>
        <Button type="button" variant="ghost" onClick={() => setDialog('end')}>
          Zakończ współpracę
        </Button>
      </section>
      <Button type="button" variant="primary" onClick={() => setDialog('invite')}>
        Dodaj współpracownika
      </Button>

      {dialog === 'invite' ? (
        <Modal
          open
          title="Dodaj współpracownika"
          description="Możesz połączyć się z osobą, która ma już konto OurWed. Akceptacja nie udostępni automatycznie żadnych zleceń."
          onClose={() => setDialog(null)}
          hideFooter
          showClose
          initialFocus="panel"
        >
          <form onSubmit={(event) => event.preventDefault()}>
            <Input id="collaboration-email" label="Adres e-mail" type="email" required />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>Anuluj</Button>
              <Button type="submit" variant="primary">Wyślij zaproszenie</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {dialog === 'end' ? (
        <Modal
          open
          title="Zakończyć współpracę?"
          description="To zatrzyma przyszłe zaproszenia do wspólnych zleceń. W przyszłości już zaakceptowane zlecenia nie znikną automatycznie."
          onClose={() => setDialog(null)}
          initialFocus="panel"
          primaryAction={(
            <Button type="button" variant="primary" onClick={() => setDialog(null)}>
              Zakończ współpracę
            </Button>
          )}
        >
          <p>Fotograf C</p>
        </Modal>
      ) : null}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<CollaborationModalViewportFixture />)
