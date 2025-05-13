import React, { useState, useRef, useEffect } from "react";

const MIN_AMOUNT = 200;
const MAX_AMOUNT = 10000;
const MIN_PERIOD = 3;
const MAX_PERIOD = 24;

// Define base currency
const BASE_CURRENCY_CODE = "BGN";
const BASE_CURRENCY_SYMBOL = "lv.";

// Example currency data: { symbol, rateToBase, name }
// rateToBase means 1 unit of this currency = X units of BASE_CURRENCY
const CURRENCY_DATA = {
  USD: { symbol: "$", rateFromBase: 0.55, name: "US Dollar" }, // 1 BGN = 0.55 USD
  EUR: { symbol: "€", rateFromBase: 0.51, name: "Euro" }, // 1 BGN = 0.51 EUR
  GBP: { symbol: "£", rateFromBase: 0.43, name: "British Pound" }, // 1 BGN = 0.43 GBP
  [BASE_CURRENCY_CODE]: { symbol: BASE_CURRENCY_SYMBOL, rateFromBase: 1, name: "Bulgarian Lev" },
};

function getInterestRate(period) {
  if (period <= 6) return 0.20;
  if (period <= 12) return 0.25;
  if (period <= 18) return 0.30;
  return 0.35;
}

function calculateMonthly(amount, period) {
  // Tiered interest: 20% (<=6m), 25% (7-12m), 30% (13-18m), 35% (19-24m)
  const interest = getInterestRate(period) * (period / 12);
  const total = amount * (1 + interest);
  return (total / period).toFixed(2);
}

function calculateAlternative(monthly) {
  // Insurance option: +30%
  return (parseFloat(monthly) * 1.3).toFixed(2);
}

const sliderStyles =
  "w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer transition-all outline-none focus:ring-0 focus:outline-none";

export default function LoanCalculator({ onGetLoan }) {
  const [amount, setAmount] = useState(MIN_AMOUNT);
  const [period, setPeriod] = useState(MIN_PERIOD);
  const [currencyInfo, setCurrencyInfo] = useState({
    code: BASE_CURRENCY_CODE,
    symbol: BASE_CURRENCY_SYMBOL,
    rateFromBase: 1, // How many units of the current currency are 1 BGN
    name: "Bulgarian Lev",
  });
  const [isLoadingCurrency, setIsLoadingCurrency] = useState(true);
  const [errorCurrency, setErrorCurrency] = useState(null);
  const containerRef = useRef(null);

  const monthlyBase = calculateMonthly(amount, period); // Always calculate in base currency
  const alternativeBase = calculateAlternative(monthlyBase);

  // Convert base currency values to the selected display currency
  const displayMonthly = (parseFloat(monthlyBase) * currencyInfo.rateFromBase).toFixed(2);
  const displayAlternative = (parseFloat(alternativeBase) * currencyInfo.rateFromBase).toFixed(2);
  const displayAmount = Math.round(amount * currencyInfo.rateFromBase);
  const displayMinAmount = Math.round(MIN_AMOUNT * currencyInfo.rateFromBase);
  const displayMaxAmount = Math.round(MAX_AMOUNT * currencyInfo.rateFromBase);

  // Tilt effect and IP-based currency
  useEffect(() => {
    const card = containerRef.current;
    if (!card) return;

    // IP Geolocation and Currency Setting
    const fetchCurrency = async () => {
      setIsLoadingCurrency(true);
      setErrorCurrency(null);
      try {
        // IMPORTANT: Using http for ip-api.com as https is often a paid feature
        // In a real app, prefer https and secure APIs.
        const response = await fetch("http://ip-api.com/json/");
        if (!response.ok) {
          throw new Error(`Geolocation API error: ${response.status}`);
        }
        const data = await response.json();
        if (data.status === "success" && data.countryCode) {
          let selectedCurrencyCode = BASE_CURRENCY_CODE; // Default
          if (data.countryCode === "US") selectedCurrencyCode = "USD";
          else if (["DE", "FR", "ES", "IT", "NL"].includes(data.countryCode)) selectedCurrencyCode = "EUR"; // Example Eurozone
          else if (data.countryCode === "GB") selectedCurrencyCode = "GBP";
          // Add more country to currency mappings as needed

          if (CURRENCY_DATA[selectedCurrencyCode]) {
            setCurrencyInfo({
              code: selectedCurrencyCode,
              symbol: CURRENCY_DATA[selectedCurrencyCode].symbol,
              rateFromBase: CURRENCY_DATA[selectedCurrencyCode].rateFromBase,
              name: CURRENCY_DATA[selectedCurrencyCode].name,
            });
          } else {
            // Fallback to base if mapped currency isn't defined
            setCurrencyInfo({
              code: BASE_CURRENCY_CODE,
              symbol: CURRENCY_DATA[BASE_CURRENCY_CODE].symbol,
              rateFromBase: CURRENCY_DATA[BASE_CURRENCY_CODE].rateFromBase,
              name: CURRENCY_DATA[BASE_CURRENCY_CODE].name,
            });
          }
        } else {
          // Fallback to base if API call fails or no countryCode
           setCurrencyInfo({
              code: BASE_CURRENCY_CODE,
              symbol: CURRENCY_DATA[BASE_CURRENCY_CODE].symbol,
              rateFromBase: CURRENCY_DATA[BASE_CURRENCY_CODE].rateFromBase,
              name: CURRENCY_DATA[BASE_CURRENCY_CODE].name,
            });
          if (data.status !== "success") {
            throw new Error(`Geolocation API unsatisfactory response: ${data.message || 'Unknown error'}`);
          }
        }
      } catch (err) {
        console.error("Failed to fetch currency:", err);
        setErrorCurrency(err.message);
        // Fallback to base currency on error
        setCurrencyInfo({
          code: BASE_CURRENCY_CODE,
          symbol: CURRENCY_DATA[BASE_CURRENCY_CODE].symbol,
          rateFromBase: CURRENCY_DATA[BASE_CURRENCY_CODE].rateFromBase,
          name: CURRENCY_DATA[BASE_CURRENCY_CODE].name,
        });
      } finally {
        setIsLoadingCurrency(false);
      }
    };

    fetchCurrency();

    // Tilt effect like UserRegistrationForm
    const handleMouseMove = (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -10;
      const rotateY = ((x - centerX) / centerX) * 10;
      card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    };
    const resetRotation = () => {
      card.style.transform = "rotateX(0deg) rotateY(0deg)";
    };
    card.addEventListener("mousemove", handleMouseMove);
    card.addEventListener("mouseleave", resetRotation);
    return () => {
      card.removeEventListener("mousemove", handleMouseMove);
      card.removeEventListener("mouseleave", resetRotation);
      card.style.transform = "rotateX(0deg) rotateY(0deg)";
    };
  }, []);

  return (
    <div ref={containerRef} className="max-w-md mx-auto bg-white rounded-xl shadow-lg p-6 space-y-6 transition-transform duration-300 border border-gray-300 will-change-transform">
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-gray-700 font-semibold">Amount</span>
          {isLoadingCurrency ? (
            <span className="text-gray-500 text-sm">Loading currency...</span>
          ) : errorCurrency ? (
            <span className="text-red-500 text-xs">Error loading currency</span>
          ) : (
            <span className="text-gray-900 font-bold">{displayAmount} {currencyInfo.symbol}</span>
          )}
        </div>
        <input
          type="range"
          min={MIN_AMOUNT}
          max={MAX_AMOUNT}
          value={amount} // Internal value remains in base currency
          onChange={e => setAmount(Number(e.target.value))}
          className={sliderStyles + " slider-amount"}
          style={{
            background: `linear-gradient(to right, #facc15 0%, #facc15 ${(amount-MIN_AMOUNT)/(MAX_AMOUNT-MIN_AMOUNT)*100}%, #e5e7eb ${(amount-MIN_AMOUNT)/(MAX_AMOUNT-MIN_AMOUNT)*100}%, #e5e7eb 100%)`
          }}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          {isLoadingCurrency ? (
            <span>...</span>
          ) : (
            <>
              <span>{displayMinAmount} {currencyInfo.symbol}</span>
              <span>{displayMaxAmount} {currencyInfo.symbol}</span>
            </>
          )}
        </div>
         {errorCurrency && <div className="text-xs text-red-500 mt-1">Could not determine local currency. Using default.</div>}
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
        <div className="text-xs text-gray-500 text-right mt-1">
          Interest rate: <span className="font-medium">{(getInterestRate(period) * 100).toFixed(0)}%</span> annual
        </div>
      </div>
      <div className="bg-gray-50 rounded-lg p-4 flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-gray-700 font-medium">Monthly Payment</span>
          {isLoadingCurrency ? (
            <span className="text-gray-500 text-sm">...</span>
          ) : (
            <span className="font-medium text-base" style={{color: "#facc15"}}>{displayMonthly} {currencyInfo.symbol}</span>
          )}
        </div>
        <div className="flex justify-between items-center text-xs text-gray-500">
          <span>With insurance option</span>
          {isLoadingCurrency ? (
             <span className="text-gray-500 text-sm">...</span>
          ) : (
            <span className="font-medium text-base">{displayAlternative} {currencyInfo.symbol}</span>
          )}
        </div>
        <div className="flex justify-between items-center text-xs text-gray-500 pt-2">
          <span>Total repayment:</span>
          {isLoadingCurrency ? (
            <span className="text-gray-500 text-sm">...</span>
          ) : (
            <span className="font-medium">{(parseFloat(displayMonthly) * period).toFixed(2)} {currencyInfo.symbol}</span>
          )}
        </div>
        <div className="flex justify-between items-center text-xs text-gray-500">
          <span>Total with insurance:</span>
          {isLoadingCurrency ? (
            <span className="text-gray-500 text-sm">...</span>
          ) : (
            <span className="font-medium">{(parseFloat(displayAlternative) * period).toFixed(2)} {currencyInfo.symbol}</span>
          )}
        </div>
         {!isLoadingCurrency && currencyInfo.code !== BASE_CURRENCY_CODE && (
          <div className="text-xs text-gray-400 pt-2 text-right">
            Original amounts in {BASE_CURRENCY_SYMBOL} ({CURRENCY_DATA[BASE_CURRENCY_CODE].name}). Exchange rate applied: 1 {BASE_CURRENCY_SYMBOL} ≈ {currencyInfo.rateFromBase.toFixed(2)} {currencyInfo.code}.
          </div>
        )}
      </div>
      <button
        className="w-full py-2 bg-yellow-400 hover:bg-yellow-300 text-black font-semibold rounded-lg shadow transition text-base"
        onClick={() => onGetLoan && onGetLoan({ 
          amount, // Base amount
          period, 
          monthly: monthlyBase, // Base monthly
          currencyCode: currencyInfo.code, // Display currency code
          displayAmount: displayAmount, // Display amount
          displayMonthly: displayMonthly, // Display monthly
        })}
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
