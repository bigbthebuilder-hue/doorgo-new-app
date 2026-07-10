import type { ProductionBoardDay } from '@/lib/production-board/types';

export function ProductionBoardReadOnly({ days }: { days: ProductionBoardDay[] }) {
  const bookingCount = days.reduce((sum, day) => sum + day.cards.length, 0);
  const totalHours = days.reduce((sum, day) => sum + day.totalShopHours, 0);

  return (
    <main style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <h1>DoorGo Production Board</h1>
      <p style={{ color: '#555' }}>
        Read-only Supabase view. Google Calendar sync and editing are not enabled.
      </p>

      <section
        style={{
          display: 'flex',
          gap: 16,
          margin: '20px 0',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
          <strong>{bookingCount}</strong>
          <div>Bookings</div>
        </div>
        <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
          <strong>{totalHours.toFixed(2)}</strong>
          <div>Total shop hours</div>
        </div>
        <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
          <strong>{days.length}</strong>
          <div>Scheduled days</div>
        </div>
      </section>

      <div style={{ display: 'grid', gap: 16 }}>
        {days.map((day) => (
          <section
            key={day.date}
            style={{
              border: '1px solid #ddd',
              borderRadius: 12,
              padding: 16,
              background: '#fff',
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              {day.date} — {day.totalShopHours.toFixed(2)} hrs
            </h2>

            <div style={{ display: 'grid', gap: 10 }}>
              {day.cards.map((card) => (
                <article
                  key={card.bookingId}
                  style={{
                    border: '1px solid #eee',
                    borderRadius: 10,
                    padding: 12,
                    background: '#fafafa',
                  }}
                >
                  <strong>{card.title}</strong>
                  <div>{card.shopHours.toFixed(2)} hrs</div>
                  <div>{card.typeLabel}</div>

                  {card.jobId ? <div>Job: {card.jobId}</div> : null}
                  {card.customer ? <div>Customer: {card.customer}</div> : null}
                  {card.salesperson ? <div>Salesperson: {card.salesperson}</div> : null}

                  {!card.jobId && card.calendarEventId ? (
                    <div>Calendar Event: {card.calendarEventId}</div>
                  ) : null}

                  <small>
                    Source: {card.sourceSystem || 'unknown'} / {card.source || 'unknown'}
                  </small>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}