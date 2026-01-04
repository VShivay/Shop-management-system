// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './files/login';
import DashboardLayout from './files/dashboard'; 
import DashboardHome from './files/main/dashboard_home';
import ManageProducts from './files/main/manage_products';
import ViewProductDetail from './files/main/view_product_detail';
import AddProduct from './files/main/add_product';       // NEW
import UpdateProduct from './files/main/update_product'; // NEW

// 1. Blocks unauthorized access
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/" replace />;
  }
  return children;
};

// 2. Blocks authorized access to Login
const PublicRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (token) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* Login Route */}
        <Route 
          path="/" 
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } 
        />

        {/* Dashboard Routes */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardHome />} />
          <Route path="products" element={<ManageProducts />} />
          <Route path="products/add" element={<AddProduct />} />          {/* NEW */}
          <Route path="products/edit/:id" element={<UpdateProduct />} />  {/* NEW */}
          <Route path="products/:id" element={<ViewProductDetail />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;