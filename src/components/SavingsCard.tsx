import React from 'react';
import { Leaf } from 'lucide-react';

interface SavingsCardProps {
  totalSavingsGrams: number;
  isSimulated: boolean;
}

export const SavingsCard: React.FC<SavingsCardProps> = ({
  totalSavingsGrams,
  isSimulated,
}) => {
  const magnitude = Math.abs(totalSavingsGrams);
  const formatted = magnitude >= 1000
    ? `${(magnitude / 1000).toFixed(2)} kg`
    : `${magnitude.toFixed(2)} g`;
  const value = totalSavingsGrams < 0
    ? `${formatted} higher emissions`
    : `${formatted} estimated savings`;

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          background: 'var(--green-glow)',
          border: '1px solid var(--green-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--green)',
        }}>
          <Leaf size={20} />
        </div>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '700' }}>Estimated Carbon Difference</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {isSimulated ? 'Simulated carbon data' : 'Provider-reported carbon data'}
          </p>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '15px 0' }}>
        <div style={{
          fontSize: '36px',
          fontWeight: '800',
          color: totalSavingsGrams < 0 ? 'var(--amber)' : 'var(--green)',
          lineHeight: '1.1',
        }}>
          {value}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px', fontWeight: '500' }}>
          Estimated from assumed workload power and elapsed duration; not measured physical energy consumption
        </div>
      </div>
    </div>
  );
};
