import React from 'react';
import { Navigate } from 'react-router-dom';

export const AccessControl: React.FC = () => {
  return <Navigate to="/users" replace />;
};

export default AccessControl;
