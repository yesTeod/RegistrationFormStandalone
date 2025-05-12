import React, { useState } from "react";

const MIN_AMOUNT = 200;
const MAX_AMOUNT = 10000;
const MIN_PERIOD = 3;
const MAX_PERIOD = 24;

function calculateMonthly(amount, period) {
  // Simple interest formula for demo: 25% annual, prorated
  const interest = 0.25 * (period / 12);
  const total = amount * (1 + interest);
  return (total / period).toFixed(2);
}

function calculateAlternative(monthly) {
  // Alternative option, e.g., with insurance (for demo: +27%)
  return (parseFloat(monthly) * 1.275).toFixed(2);
}

const sliderStyles =
  "w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer transition-all outline-none focus:ring-0 focus:outline-none";

export default function LoanCalculator({ onGetLoan }) {
  const [amount, setAmount] = useState(MIN_AMOUNT);
  const [period, setPeriod] = useState(MIN_PERIOD);

  const monthly = calculateMonthly(amount, period);
  const alternative = calculateAlternative(monthly);

  return (
    <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg p-6 space-y-6">
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-gray-700 font-semibold">Amount</span>
          <span className="text-gray-900 font-bold">{amount} lv.</span>
        </div>
        <input
          type="range"
          min={MIN_AMOUNT}
          max={MAX_AMOUNT}
          value={amount}
          onChange={e => setAmount(Number(e.target.value))}
          className={sliderStyles + " slider-amount"}
          style={{
            background: `linear-gradient(to right, #facc15 0%, #facc15 ${(amount-MIN_AMOUNT)/(MAX_AMOUNT-MIN_AMOUNT)*100}%, #e5e7eb ${(amount-MIN_AMOUNT)/(MAX_AMOUNT-MIN_AMOUNT)*100}%, #e5e7eb 100%)`
          }}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{MIN_AMOUNT} lv.</span>
          <span>{MAX_AMOUNT} lv.</span>
        </div>
      </div>
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-gray-700 font-semibold">Period</span>
          <span className="text-gray-900 font-bold">{period} months</span>
        </div>
        <input
          type="range"
          min={MIN_PERIOD}
          max={MAX_PERIOD}
          value={period}
          onChange={e => setPeriod(Number(e.target.value))}
          className={sliderStyles + " slider-period"}
          style={{
            background: `linear-gradient(to right, #facc15 0%, #facc15 ${(period-MIN_PERIOD)/(MAX_PERIOD-MIN_PERIOD)*100}%, #e5e7eb ${(period-MIN_PERIOD)/(MAX_PERIOD-MIN_PERIOD)*100}%, #e5e7eb 100%)`
          }}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{MIN_PERIOD} months</span>
          <span>{MAX_PERIOD} months</span>
        </div>
      </div>
      <div className="bg-gray-50 rounded-lg p-4 flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-gray-700 font-medium">Monthly Payment</span>
          <span className="font-bold text-lg" style={{color: "#facc15"}}>{monthly} lv.</span>
        </div>
        <div className="flex justify-between items-center text-sm text-gray-500">
          <span>With insurance option</span>
          <span>{alternative} lv.</span>
        </div>
      </div>
      <button
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg shadow transition text-lg"
        onClick={() => onGetLoan && onGetLoan({ amount, period, monthly })}
      >
        Get Loan
      </button>
      {/* Custom slider thumb styles for all browsers, always yellow, rounded, no blue or square focus */}
      <style>{`
        input[type='range'].slider-amount,
        input[type='range'].slider-period {
          outline: none !important;
          box-shadow: none !important;
        }
        /* Webkit browsers */
        input[type='range'].slider-amount::-webkit-slider-thumb,
        input[type='range'].slider-period::-webkit-slider-thumb {
          appearance: none;
          width: 1.5rem;
          height: 1.5rem;
          background: #facc15;
          border: 4px solid #fff;
          border-radius: 9999px;
          box-shadow: 0 2px 8px 0 rgba(0,0,0,0.10);
          transition: background 0.2s, box-shadow 0.2s;
        }
        input[type='range'].slider-amount:focus::-webkit-slider-thumb,
        input[type='range'].slider-period:focus::-webkit-slider-thumb,
        input[type='range'].slider-amount:active::-webkit-slider-thumb,
        input[type='range'].slider-period:active::-webkit-slider-thumb {
          background: #fde047;
          box-shadow: 0 0 0 6px #fef9c3;
          outline: none;
        }
        /* Remove default focus ring */
        input[type='range'].slider-amount:focus,
        input[type='range'].slider-period:focus {
          outline: none !important;
          box-shadow: none !important;
        }
        /* Firefox */
        input[type='range'].slider-amount::-moz-range-thumb,
        input[type='range'].slider-period::-moz-range-thumb {
          width: 1.5rem;
          height: 1.5rem;
          background: #facc15;
          border: 4px solid #fff;
          border-radius: 9999px;
          box-shadow: 0 2px 8px 0 rgba(0,0,0,0.10);
          transition: background 0.2s, box-shadow 0.2s;
        }
        input[type='range'].slider-amount:focus::-moz-range-thumb,
        input[type='range'].slider-period:focus::-moz-range-thumb,
        input[type='range'].slider-amount:active::-moz-range-thumb,
        input[type='range'].slider-period:active::-moz-range-thumb {
          background: #fde047;
          box-shadow: 0 0 0 6px #fef9c3;
        }
        /* Remove default focus ring in Firefox */
        input[type='range'].slider-amount:focus,
        input[type='range'].slider-period:focus {
          outline: none !important;
          box-shadow: none !important;
        }
        /* IE/Edge */
        input[type='range'].slider-amount::-ms-thumb,
        input[type='range'].slider-period::-ms-thumb {
          width: 1.5rem;
          height: 1.5rem;
          background: #facc15;
          border: 4px solid #fff;
          border-radius: 9999px;
          box-shadow: 0 2px 8px 0 rgba(0,0,0,0.10);
          transition: background 0.2s, box-shadow 0.2s;
        }
        input[type='range'].slider-amount:focus::-ms-thumb,
        input[type='range'].slider-period:focus::-ms-thumb,
        input[type='range'].slider-amount:active::-ms-thumb,
        input[type='range'].slider-period:active::-ms-thumb {
          background: #fde047;
          box-shadow: 0 0 0 6px #fef9c3;
        }
        /* Remove default focus ring in IE/Edge */
        input[type='range'].slider-amount:focus,
        input[type='range'].slider-period:focus {
          outline: none !important;
          box-shadow: none !important;
        }
      `}</style>
    </div>
  );
} 
