import React from 'react';

const wrapperStyle = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  flexDirection: 'row',
  justifyContent: 'center',
};

// CSS spinner (see .loading-spinner in public/app.css). Replaces MUI CircularProgress so we
// can drop @mui/material + emotion (~96 KB) that existed only for this one control (#143).
export default function LoadingSpinner () {
  return (
    <div style={wrapperStyle}>
      <div className="loading-spinner" role="status" aria-label="Loading" />
    </div>
  );
}
