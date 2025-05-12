import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import UserRegistrationForm from "./components/UserRegistrationForm.js";
import LoanCalculator from "./components/LoanCalculator.js";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UserRegistrationForm />} />
        <Route path="/LoanCalculator" element={<LoanCalculator />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;


