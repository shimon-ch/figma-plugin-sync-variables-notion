// DaisyUIに合わせてプレーン要素に置換

interface StatusMessageProps {
  type: 'loading' | 'success' | 'error';
  message: string;
  details?: {
    error?: string;
    suggestion?: string;
  };
}

const StatusMessage = ({ type, message, details }: StatusMessageProps) => {
  const getIcon = () => {
    switch (type) {
      case 'loading':
        return <span className="loading loading-spinner text-primary" />;
      case 'success':
        return <span className="text-success text-lg">✅</span>;
      case 'error':
        return <span className="text-error text-lg">❌</span>;
      default:
        return null;
    }
  };



  return (
    <div className="fixed bottom-4 left-4 right-4 z-50">
      <div className={`alert shadow-lg ${
        type === 'success' ? 'alert-success' :
        type === 'error' ? 'alert-error' : 'alert-info'
      }`}>
        <div>
          {getIcon()}
          <span>{message}</span>
        </div>
        {details && details.suggestion && (
          <div className="text-sm opacity-80">💡 {details.suggestion}</div>
        )}
      </div>
    </div>
  );
};

export default StatusMessage;
