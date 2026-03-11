// src/App.js
import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react'; // Re-using lucide-react from your dashboard

// --- Eager Loading ---
// We load Login and the main Layout immediately so the initial paint is fast
import Login from './files/login';
import DashboardLayout from './files/dashboard'; 

// --- Lazy Loading (Code Splitting) ---
// These components are only downloaded when the user navigates to their routes
const DashboardHome = lazy(() => import('./files/main/dashboard_home'));

// Products
const ManageProducts = lazy(() => import('./files/main/product/manage_products'));
const ViewProductDetail = lazy(() => import('./files/main/product/view_product_detail'));
const AddProduct = lazy(() => import('./files/main/product/add_product'));        
const UpdateProduct = lazy(() => import('./files/main/product/update_product'));

// Suppliers
const ManageSupplier = lazy(() => import('./files/main/supplier/manage_supplier'));
const DetailSupplier = lazy(() => import('./files/main/supplier/detail_supplier'));
const AddSupplier = lazy(() => import('./files/main/supplier/add_supplier'));        
const UpdateSupplier = lazy(() => import('./files/main/supplier/update_supplier')); 

// Customers
const ManageCustomer = lazy(() => import('./files/main/customer/manage_customer'));
const CustomerDetail = lazy(() => import('./files/main/customer/customer_detail'));
const AddCustomer = lazy(() => import('./files/main/customer/add_customer'));            
const UpdateCustomer = lazy(() => import('./files/main/customer/update_customer'));

// Billing
const CreateRetailBill = lazy(() => import('./files/main/create_retail_bill'));
const ViewRetailBill = lazy(() => import('./files/main/view_retail_bill'));
const CreateWholesaleBill = lazy(() => import('./files/main/create_wholesale_bill')); 
const ViewWholesaleBill = lazy(() => import('./files/main/view_wholesale_bill'));

// Restock
const RestockProduct = lazy(() => import('./files/main/restock_product')); 

// Reports
const ProfitLossReportAnalysis = lazy(() => import('./files/main/report_analysis'));
const CustomerReportAnalysis = lazy(() => import('./files/main/customer_report_analysis'));
const InventoryReportAnalysis = lazy(() => import('./files/main/inventory_report_analysis')); 

// --- Route Guards ---
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

// --- Fallback Loader ---
const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <Loader2 size={40} className="animate-spin" color="#3b82f6" />
  </div>
);

function App() {
  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public Route */}
          <Route path="/" element={<PublicRoute><Login /></PublicRoute>} />

          {/* Protected Routes inside Dashboard Layout */}
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
            <Route path="customers/add" element={<AddCustomer />} />          
            <Route path="customers/edit/:id" element={<UpdateCustomer />} /> 
            <Route path="customers/:id" element={<CustomerDetail />} />

            {/* Billing */}
            <Route path="retail-billing" element={<CreateRetailBill />} />
            <Route path="wholesale-billing" element={<CreateWholesaleBill />} /> 
            <Route path="view-retail-bills" element={<ViewRetailBill />} />
            <Route path="view-wholesale-bills" element={<ViewWholesaleBill />} /> 
            
            {/* Restock */}
            <Route path="restock" element={<RestockProduct />} />

            {/* Reports */}
            <Route path="reports" element={<ProfitLossReportAnalysis />} />
            <Route path="customer-reports" element={<CustomerReportAnalysis />} />
            <Route path="reports/inventory" element={<InventoryReportAnalysis />} />
          </Route>

          {/* 404 Catch-All */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;