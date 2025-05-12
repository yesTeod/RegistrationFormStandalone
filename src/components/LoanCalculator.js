import React, { useState } from "react";

const MIN_AMOUNT = 200;
const MAX_AMOUNT = 10000;
const MIN_PERIOD = 3;
const MAX_PERIOD = 24;

function calculateMonthly(amount, period) {
  // Simple interest formula for demo: 10% annual, prorated
  const interest = 0.1 * (period / 12);
  const total = amount * (1 + interest);
  return (total / period).toFixed(2);
}

function calculateAlternative(monthly) {
  // Alternative option, e.g., with insurance (for demo: +27%)
  return (parseFloat(monthly) * 1.275).toFixed(2);
}

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
          className="w-full accent-yellow-400"
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
          className="w-full accent-yellow-400"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{MIN_PERIOD} months</span>
          <span>{MAX_PERIOD} months</span>
        </div>
      </div>
      <div className="bg-gray-50 rounded-lg p-4 flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-gray-700 font-medium">Monthly Payment</span>
          <span className="text-blue-600 font-bold text-lg">{monthly} lv.</span>
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
    </div>
  );
} 