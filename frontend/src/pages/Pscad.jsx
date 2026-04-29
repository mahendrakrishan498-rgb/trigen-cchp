import PageHeader from '../components/PageHeader';

export default function Pscad() {
  return (
    <>
      <PageHeader
        title="Design Analysis"
        subtitle="Electrical and dynamic design analysis module"
      />

      <section className="panel" style={{ textAlign: 'center', padding: '60px 30px' }}>
        <h2 style={{ color: '#0f5132', marginBottom: '12px' }}>
          Design Analysis Coming Soon
        </h2>

        <p className="muted" style={{ maxWidth: '650px', margin: '0 auto', lineHeight: '1.7' }}>
          This section will be used to display PSCAD/MATLAB-based design analysis results,
          including generator output, voltage response, frequency response, grid export behavior,
          and system stability indicators.
        </p>

        <div style={{ marginTop: '28px' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '10px 18px',
              borderRadius: '20px',
              background: '#e8f5e9',
              color: '#0f5132',
              fontWeight: '600'
            }}
          >
            Module under development
          </span>
        </div>
      </section>
    </>
  );
}