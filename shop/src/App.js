// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './files/login';
import DashboardLayout from './files/dashboard'; 
import DashboardHome from './files/main/dashboard_home';

// Products
import ManageProducts from './files/main/product/manage_products';
import ViewProductDetail from './files/main/product/view_product_detail';
import AddProduct from './files/main/product/add_product';        
import UpdateProduct from './files/main/product/update_product';

// Suppliers
import ManageSupplier from './files/main/supplier/manage_supplier';
import DetailSupplier from './files/main/supplier/detail_supplier';
import AddSupplier from './files/main/supplier/add_supplier';     
import UpdateSupplier from './files/main/supplier/update_supplier'; 

// Customers
import ManageCustomer from './files/main/customer/manage_customer';
import CustomerDetail from './files/main/customer/customer_detail';
import AddCustomer from './files/main/customer/add_customer';     // NEW
import UpdateCustomer from './files/main/customer/update_customer'; // NEW

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/" replace />;
  return children;
};

const PublicRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (token) return <Navigate to="/dashboard" replace />;
  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<PublicRoute><Login /></PublicRoute>} />

        <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<DashboardHome />} />
          
          {/* Products */}
          <Route path="products" element={<ManageProducts />} />
          <Route path="products/add" element={<AddProduct />} />          
          <Route path="products/edit/:id" element={<UpdateProduct />} />  
          <Route path="products/:id" element={<ViewProductDetail />} />

          {/* Suppliers */}
          <Route path="suppliers" element={<ManageSupplier />} />
          <Route path="suppliers/add" element={<AddSupplier />} />          
          <Route path="suppliers/edit/:id" element={<UpdateSupplier />} /> 
          <Route path="suppliers/:id" element={<DetailSupplier />} />

          {/* Customers */}
          <Route path="customers" element={<ManageCustomer />} />
          <Route path="customers/add" element={<AddCustomer />} />         {/* NEW */}
          <Route path="customers/edit/:id" element={<UpdateCustomer />} /> {/* NEW */}
          <Route path="customers/:id" element={<CustomerDetail />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;