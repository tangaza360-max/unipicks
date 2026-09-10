import { useState } from 'react'
import { Home, ShoppingBag, User, MessageCircle } from 'lucide-react'
import OrdersTab from './OrdersTab.jsx'
import ProfileTab from './ProfileTab.jsx'
import DesktopNav from './DesktopNav.jsx'
import Messages from '../pages/Messages.jsx'

export default function StudentLayout({ children, onLogout }) {
  const [activeTab, setActiveTab] = useState('home')

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return children
      case 'orders':
        return <OrdersTab />
      case 'profile':
        return <ProfileTab />
      case 'messages':
        return <Messages />
      default:
        return children
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Desktop Header with Navigation */}
      <header className="hidden md:flex items-center justify-between px-4 md:px-6 py-3 border-b border-border/40 bg-card/60 sticky top-0 z-40 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="font-display text-xl font-bold text-foreground">Unipicks</span>
        </div>
        <DesktopNav activeTab={activeTab} setActiveTab={setActiveTab} />
        <div className="flex items-center gap-2">
          <button
            onClick={onLogout}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted/50"
          >
            Log out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 pb-20 md:pb-0 overflow-y-auto">
        <div className="animate-fadeIn">
          {renderContent()}
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border/40 flex items-center justify-around"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors select-none relative ${
            activeTab === 'home' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Home size={22} />
          <span className="text-[10px] font-medium">Home</span>
          {activeTab === 'home' && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />}
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors select-none relative ${
            activeTab === 'orders' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <ShoppingBag size={22} />
          <span className="text-[10px] font-medium">Orders</span>
          {activeTab === 'orders' && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />}
        </button>

        <button
          onClick={() => setActiveTab('messages')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors select-none relative ${
            activeTab === 'messages' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <MessageCircle size={22} />
          <span className="text-[10px] font-medium">Messages</span>
          {activeTab === 'messages' && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />}
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors select-none relative ${
            activeTab === 'profile' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <User size={22} />
          <span className="text-[10px] font-medium">Profile</span>
          {activeTab === 'profile' && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />}
        </button>
      </nav>
    </div>
  )
}