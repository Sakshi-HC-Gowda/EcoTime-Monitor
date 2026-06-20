import React from 'react';
import { Leaf, Smartphone, Car, TreePine, Lightbulb } from 'lucide-react';

interface SavingsCardProps {
  totalSavingsGrams: number;
}

export const SavingsCard: React.FC<SavingsCardProps> = ({ totalSavingsGrams }) => {
  // Equivalency calculations based on EPA Greenhouse Gas Equivalencies Calculator
  // 1. Smartphone charged: ~8.3 grams of CO2
  const smartphoneCharges = Math.round(totalSavingsGrams / 8.3);
  
  // 2. Average gasoline vehicle mile: ~385 grams of CO2
  const vehicleMiles = (totalSavingsGrams / 385).toFixed(2);
  
  // 3. Tree seedling grown for 10 years (sequesters ~60,000g of CO2 total)
  const treeSeedlings = (totalSavingsGrams / 60000).toFixed(4);
  
  // 4. LED lightbulb hours (10W bulb on 400g/kWh average grid = 4 grams of CO2 per hour)
  const lightbulbHours = Math.round(totalSavingsGrams / 4.0);

  const formatCo2 = (grams: number) => {
    if (grams >= 1000) {
      return `${(grams / 1000).toFixed(2)} kg`;
    }
    return `${grams.toFixed(0)} g`;
  };

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
          color: 'var(--green)'
        }}>
          <Leaf size={20} />
        </div>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '700' }}>Carbon Savings</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Real-time indirect emission reductions</p>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '15px 0', borderBottom: '1px solid var(--border-glass)' }}>
        <div style={{ 
          fontSize: '48px', 
          fontWeight: '800', 
          color: 'var(--green)',
          textShadow: '0 0 20px rgba(16, 185, 129, 0.2)',
          lineHeight: '1.1'
        }}>
          {formatCo2(totalSavingsGrams)}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px', fontWeight: '500' }}>
          Total CO₂e Prevented From Entering Atmosphere
        </div>
      </div>

      <div className="savings-flex-container">
        {/* Smartphone charges */}
        <div className="equivalent-card">
          <div className="equivalent-icon-wrapper" style={{ color: '#38bdf8', background: 'rgba(56, 189, 248, 0.06)' }}>
            <Smartphone size={20} />
          </div>
          <div className="equivalent-value">
            {smartphoneCharges.toLocaleString()}
          </div>
          <div className="equivalent-label">
            Smartphone<br />Charges Saved
          </div>
        </div>

        {/* Vehicle miles */}
        <div className="equivalent-card">
          <div className="equivalent-icon-wrapper" style={{ color: '#fb923c', background: 'rgba(251, 146, 60, 0.06)' }}>
            <Car size={20} />
          </div>
          <div className="equivalent-value">
            {vehicleMiles}
          </div>
          <div className="equivalent-label">
            Gasoline Car Miles<br />Avoided
          </div>
        </div>

        {/* Tree seedlings */}
        <div className="equivalent-card">
          <div className="equivalent-icon-wrapper" style={{ color: '#4ade80', background: 'rgba(74, 222, 128, 0.06)' }}>
            <TreePine size={20} />
          </div>
          <div className="equivalent-value">
            {parseFloat(treeSeedlings) > 0.0001 ? treeSeedlings : '0.0000'}
          </div>
          <div className="equivalent-label">
            Ten-Year Tree<br />Seedlings Grown
          </div>
        </div>

        {/* Lightbulb hours */}
        <div className="equivalent-card">
          <div className="equivalent-icon-wrapper" style={{ color: '#facc15', background: 'rgba(250, 204, 21, 0.06)' }}>
            <Lightbulb size={20} />
          </div>
          <div className="equivalent-value">
            {lightbulbHours.toLocaleString()}
          </div>
          <div className="equivalent-label">
            LED Lightbulb<br />Hours Saved
          </div>
        </div>
      </div>
    </div>
  );
};
