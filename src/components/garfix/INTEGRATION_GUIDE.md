/**
 * ═══════════════════════════════════════════════════════════════
 * GarfiX AI - AppShell Integration Guide
 * 
 * This file demonstrates how to integrate all GarfiX AI components
 * into the main application shell (AppShell) and various pages.
 * 
 * Copy/paste or adapt these patterns to enable AI Everywhere!
 * ═══════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════
// INTEGRATION 1: Enhanced AICopilotBubble for AppShell
// ═══════════════════════════════════════════════════════════════

/*
  Replace your existing AICopilotBubble in AppShell.tsx with this enhanced version:

  import { AICopilotBubble } from '@/components/garfix'
  
  // Inside AppShell component, add state:
  const [isAIOpen, setIsAIOpen] = useState(false)
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([])
  const [aiStatus, setAiStatus] = useState<'idle' | 'thinking' | 'active' | 'error'>('idle')
  
  // AI message handler
  const handleAIMessage = async (message: string) => {
    // Add user message
    setAiMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    }])
    
    setAiStatus('thinking')
    
    try {
      // Call your AI API here
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context: 'general' })
      })
      const data = await response.json()
      
      // Add assistant response
      setAiMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        actions: data.actions || []
      }])
      
      setAiStatus('active')
    } catch (error) {
      setAiStatus('error')
      setAiMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'عذراً، حدث خطأ. حاول مرة أخرى.',
        timestamp: new Date(),
      }])
    }
  }
  
  // Render in AppShell (before closing </div>):
  <AICopilotBubble
    isOpen={isAIOpen}
    status={aiStatus}
    messages={aiMessages}
    onToggle={() => setIsAIOpen(!isAIOpen)}
    onSend={handleAIMessage}
    suggestions={[
      { id: 's1', label: 'إنشاء فاتورة جديدة', onClick: () => { navigate('invoices') } },
      { id: 's2', label: 'ملخص المبيعات', onClick: () => { navigate('dash') } },
      { id: 's3', label: 'تحليل الذممة المالية', onClick: () => { navigate('reports') } },
    ]}
  />
*/

// ═══════════════════════════════════════════════════════════════
// INTEGRATION 2: AI Status Bar in Topbar
// ═══════════════════════════════════════════════════════════════

/*
  In Topbar.tsx, add AI status indicator:

  import { AIStatusBar } from '@/components/garfix'
  
  // In the topbar header section:
  <div className="flex items-center gap-2">
    <AIStatusBar
      status="online"
      lastActivity="ساعد في إنشاء فاتورة"
      onClick={() => window.dispatchEvent(new CustomEvent('open-ai-copilot'))}
    />
    
    {/* Other topbar items */}
    <NotificationsButton />
    <UserMenu />
  </div>
*/

// ═══════════════════════════════════════════════════════════════
// INTEGRATION 3: AI-Enhanced Empty States in Pages
// ═══════════════════════════════════════════════════════════════

/*
  Example: InvoicesView.tsx with AI empty state:

  import { AIEmptyState } from '@/components/garfix'
  
  function InvoicesView() {
    const { data, isLoading } = useInvoices()
    
    if (isLoading) return <InvoiceSkeleton />
    
    if (!data || data.length === 0) {
      return (
        <AIEmptyState
          type="invoices"
          primaryAction={{
            label: 'إنشاء فاتورة بالـ AI',
            variant: 'gradient',
            onClick: () => setShowAIDescribe(true),
          }}
          aiAction={{
            label: 'دعني أساعدك',
            onClick: () => openAICopilot(),
            description: 'يمكنني مساعدتك في أول فاتورة',
          }}
          suggestions={[
            { id: 'e1', label: 'استيراد فواتير', onClick: () => {} },
            { id: 'e2', label: 'عرض تعليمي', onClick: () => {} },
            { id: 'e3', label: 'تواصل مع الدعم', onClick: () => {} },
          ]}
        />
      )
    }
    
    return <InvoicesTable data={data} />
  }
*/

// ═══════════════════════════════════════════════════════════════
// INTEGRATION 4: Smart Invoice Creation Page
// ═══════════════════════════════════════════════════════════════

/*
  Example: CreateInvoicePage with full AI integration:

  import { 
    AIInvoiceAssistant,
    AIDescribeInput,
    AIFormField,
    AICategorizer,
  } from '@/components/garfix'
  
  function CreateInvoicePage() {
    const [step, setStep] = useState<'client' | 'items' | 'details'>('client')
    const [isProcessing, setIsProcessing] = useState(false)
    
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <GarfixAIIcon size="lg" glow />
          إنشاء فاتورة جديدة
        </h1>
        
        {/* AI Assistant Panel */}
        <AIInvoiceAssistant
          currentStep={step}
          onDescribe={(desc) => handleAIDescribe(desc)}
          onExtract={() => handleExtractFromImage()}
          onTranslate={(dir) => handleTranslate(dir)}
          onValidate={() => validateInvoice()}
          onDetectAnomalies={() => detectAnomalies()}
          isProcessing={isProcessing}
        />
        
        {/* Natural Language Input */}
        <Card variant="elevated">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">أو صف فاتورتك باللغة الطبيعية</h3>
            
            <AIDescribeInput
              value={description}
              onChange={setDescription}
              onSubmit={handleAISubmit}
              isProcessing={isProcessing}
              examples={[
                'فاتورة بيع لأحمد علي بمبلغ 5000 ريال شامل الضريبة',
                'إيصال دفعة مقدمة من شركة النور 10000 ريال',
              ]}
            />
          </CardContent>
        </Card>
        
        {/* Form Fields with AI */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AIFormField
            label="العميل"
            value={clientName}
            onChange={setClientName}
            placeholder="اسم العميل أو الشركة"
            enableAutoFill
            onAutoFill={() => suggestClients()}
            explanation="يمكن لـ AI استخراج بيانات العميل من الفواتير السابقة"
          />
          
          <AIFormField
            label="المبلغ"
            value={amount}
            onChange={setAmount}
            type="number"
            enableValidation
            validationStatus={amountValidation}
            validationMessage={amount > 0 ? '' : 'أدخل مبلغ صحيح'}
          />
          
          <div className="md:col-span-2">
            <AICategorizer
              categories={['بيع', 'شراء', 'خدمة', 'استشارة', 'ضريبي']}
              selected={categories}
              onSelect={setCategories}
              allowAISuggest
              onSuggestCategories={() => suggestCategoriesFromContent()}
              isSuggesting={isCategorizing}
              aiSuggestions={['خدمات تصميم', 'منتجات تقنية']}
            />
          </div>
        </div>
      </div>
    )
  }
*/

// ═══════════════════════════════════════════════════════════════
// INTEGRATION 5: Dashboard with AI Insights
// ═══════════════════════════════════════════════════════════════

/*
  Example: DashboardView with AI-powered KPIs:

  import { 
    AIDashboardInsights,
    AIKpiCard,
    AISummaryCard,
    AISearchBar,
  } from '@/components/garfix'
  
  function DashboardView() {
    return (
      <div className="space-y-6">
        {/* Header with AI Search */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">لوحة التحكم</h1>
            <p className="text-muted-foreground">مرحباً! إليك ملخص أعمالك اليوم</p>
          </div>
          
          <AISearchBar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onSearch={handleSearch}
            enableAINaturalSearch
            onAISearch={handleAINaturalSearch}
            suggestions={[
              'الفواتير المدفوعة هذا الشهر',
              'أفضل العملاء هذا الربع',
              'المقارنة مع الشهر الماضي',
            ]}
            recentSearches={recentSearches}
            className="w-full sm:w-80"
          />
        </div>
        
        {/* AI Insights Widget */}
        <AIDashboardInsights
          insights={dashboardInsights}
          isLoading={isLoadingInsights}
          onRefresh={refreshInsights}
          maxItems={4}
        />
        
        {/* KPI Cards with AI Commentary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
          <AIKpiCard
            title="إجمالي المبيعات"
            value={125430}
            format="currency"
            change={12.5}
            changeType="positive"
            aiCommentary="أداء قوي! بناءً على الاتجاه الحالي، من المتوقع تجاوز هدف الشهر."
            aiTrend="up"
            trendConfidence={85}
            onClick={() => navigateToSalesDetails()}
          />
          
          <AIKpiCard
            title="الفواتير المعلقة"
            value={8}
            change={-15}
            changeType="negative"
            aiCommentary="3 فواتير تأخرت أكثر من 30 يوم. يُنصح بالمتابعة.'
            aiTrend="down"
            trendConfidence={72}
            onClick={() => navigateToOverdueInvoices()}
          />
          
          {/* More KPI cards... */}
        </div>
        
        {/* AI Summary Card */}
        <AISummaryCard
          title="ملخص الأعمال الشهري"
          summary="أداء عملك هذا الأسبوع كان إيجابياً بشكل عام. المبيعات ارتفعت 12% عن الأسبوع الماضي، لكن هناك 3 فواتير تحتاج متابعة عاجلة. التدفق النقدي مستقر لكن يمكن تحسينه بتقديم خصومات للدفع المبكر."
          metrics={[
            { label: 'إجمالي الإيرادات', value: '125,430 ر.س', change: 12.5, changeType: 'positive' },
            { label: 'الفواتير الجديدة', value: '24', change: 8, changeType: 'positive' },
            { label: 'العملاء النشطين', value: '156', change: 5, changeType: 'positive' },
          ]}
          insights={[
            'أفضل عميلك هو "شركة النور" بمبيعات 25,000 ريال',
            'فئة "خدمات التصميم" هي الأكثر مبيعاً هذا الشهر',
            'متوسط دورة التحصيل: 18 يوم (أفضل من المتوسط: 25 يوم)',
          ]}
          actions={[
            { label: 'تصدير تقرير مفصل', onClick: () => exportReport() },
            { label: 'اقتراحات تحسين', onClick: () => showSuggestions() },
          ]}
          isLoading={false}
          onRegenerate={() => regenerateSummary()}
        />
      </div>
    )
  }
*/

// ═══════════════════════════════════════════════════════════════
// INTEGRATION 6: Proactive Notifications
// ═══════════════════════════════════════════════════════════════

/*
  Example: Notification system with AI alerts:

  import { AINotificationCenter } from '@/components/garfix'
  
  function NotificationsDropdown() {
    const [notifications, setNotifications] = useState<AINotification[]>([
      {
        id: 'n1',
        type: 'alert',
        title: 'فواتير متأخرة تحتاج متابعة',
        message: '3 فواتير بقيمة 8,500 ريال تأخر سدادها أكثر من 30 يوم',
        timestamp: new Date(Date.now() - 3600000),
        action: { label: 'تابع الفواتير', onClick: () => navigateToInvoices() },
        priority: 'high',
        confidence: 92,
      },
      {
        id: 'n2',
        type: 'achievement',
        title: '🎉 إنجاز رائع!',
        message: 'حققت هدف المبيعات الشهري بنسبة 103%',
        timestamp: new Date(Date.now() - 7200000),
        priority: 'low',
      },
      {
        id: 'n3',
        type: 'insight',
        title: 'فرصة تحسين التدفق النقدي',
        message: 'يمكنك تحسين التدفق النقدي بتقديم خصم 2% للدفع المبكر',
        timestamp: new Date(Date.now() - 10800000),
        action: { label: 'تفعيل الاقتراح', onClick: () => enableEarlyPaymentDiscount() },
        confidence: 78,
      },
    ])
    
    return (
      <div className="relative">
        {/* Bell icon trigger */}
        <button onClick={() => setShowNotifications(!showNotifications)}>
          <Bell />
          {notifications.filter(n => !n.read).length > 0 && (
            <Badge>{notifications.filter(n => !n.read).length}</Badge>
          )}
        </button>
        
        {/* Notifications dropdown */}
        {showNotifications && (
          <AINotificationCenter
            notifications={notifications}
            compact
            onMarkRead={(id) => markNotificationRead(id)}
            onMarkAllRead={() => markAllRead()}
            onDismiss={(id) => dismissNotification(id)}
          />
        )}
      </div>
    )
  }
*/

// ═══════════════════════════════════════════════════════════════
// INTEGRATION 7: Voice Input for AI Commands
// ═══════════════════════════════════════════════════════════════

/*
  Example: Voice input for AI Copilot:

  import { AIVoiceInput } from '@/components/garfix'
  
  function AICopilotWithVoice() {
    return (
      <div className="flex flex-col gap-4">
        {/* Text input (existing) */}
        <textarea ... />
        
        {/* Voice input option */}
        <AIVoiceInput
          onTranscript={(text) => setInputValue(text)}
          onSubmit={(command) => handleVoiceCommand(command)}
          isListening={isListening}
          onToggleListening={() => setIsListening(!isListening)}
          language="ar" // or 'en' or 'auto'
          showVisualizer
        />
      </div>
    )
  }
*/

// ═══════════════════════════════════════════════════════════════
// INTEGRATION 8: Onboarding Tour for New Users
// ═══════════════════════════════════════════════════════════════

/*
  Example: First-time user onboarding tour:

  import { AIOnboardingTour } from '@/components/garfix'
  
  function AppWithOnboarding() {
    const [showTour, setShowTour] = useState(false)
    const [currentStep, setCurrentStep] = useState(0)
    
    const tourSteps: TourStep[] = [
      {
        id: 'welcome',
        target: '#sidebar',
        title: 'مرحباً بك في GarfiX! 🎉',
        content: 'دعني أرشدك خلال رحلة التعرف على النظام. يمكنك القفز في أي وقت!',
        position: 'right',
        illustration: <GarfixAIIcon size="lg" />,
      },
      {
        id: 'ai-assistant',
        target: '#ai-bubble-trigger',
        title: 'مساعدك الذكي GarfiX AI',
        content: 'هذا هو مساعدك الشخصي. اسأله أي شيء عن محاسبتك أو عملك وسيساعدك!',
        position: 'top',
        skippable: true,
        action: { label: 'جرّب الآن', onClick: () => openAICopilot() },
      },
      {
        id: 'dashboard',
        target: '#dashboard-kpis',
        title: 'لوحة التحكم الذكية',
        content: 'كل البطاقات هنا مدعومة بـ AI. انقر على أي KPI للحصول على تحليلات ذكية.',
        position: 'bottom',
      },
      {
        id: 'invoices',
        target: '#invoices-table',
        title: 'إدارة الفواتير',
        content: 'يمكنك إنشاء فواتير بالكامل باستخدام AI. فقط اصف ما تريد!',
        position: 'top',
        action: { label: 'جرب إنشاء فاتورة', onClick: () => navigateToCreateInvoice() },
      },
    ]
    
    return (
      <>
        <AppShell />
        
        {showTour && (
          <AIOnboardingTour
            steps={tourSteps}
            currentStep={currentStep}
            onNext={() => setCurrentStep(s => s + 1)}
            onPrev={() => setCurrentStep(s => s - 1)}
            onSkip={() => setShowTour(false)}
            onFinish={() => {
              setShowTour(false)
              celebrateFirstLogin()
            }}
            isActive={showTour}
          />
        )}
      </>
    )
  }
*/

// ═══════════════════════════════════════════════════════════════
// QUICK START: Minimal Integration Checklist
// ═══════════════════════════════════════════════════════════════

/*
  ✅ MINIMAL INTEGRATION CHECKLIST
  
  Step 1: Install components
  ───────────────────────
  All files are already in src/components/garfix/:
  ✓ GarfixAIIcon.tsx       (Brand & Icon)
  ✓ GarfixAIComponents.tsx  (Core UI: Bubble, Suggestions, etc.)
  ✓ GarfixAIContextual.tsx   (Phase 2: Empty States, Forms, Tables)
  ✓ GarfixAISmartActions.tsx (Phase 3: Invoice, Dashboard, Nav)
  ✓ GarfixAIProactive.tsx   (Phase 4: Notifications, Memory, Voice)
  ✓ GarfixAIPolish.tsx      (Phase 5: Celebrations, Tour, Discovery)
  ✓ index.ts                 (Main exports)

  Step 2: Import in AppShell.tsx
  ──────────────────────────
  import { AICopilotBubble } from '@/components/garfix'
  
  Add state:
  const [isAIOpen, setIsAIOpen] = useState(false)
  
  Render before closing </div>:
  <AICopilotBubble isOpen={isAIOpen} onToggle={() => setIsAIOpen(!isAIOpen)} />

  Step 3: Replace empty states (optional but recommended)
  ───────────────────────────────────────────────
  Import AIEmptyState in any page:
  import { AIEmptyState } from '@/components/garfix'
  
  Use when data is empty:
  <AIEmptyState type="invoices" primaryAction={{...}} aiAction={{...}} />

  Step 4: Test it!
  ──────────────
  npm run dev
  Open http://localhost:3000
  Look for the AI bubble button (bottom-right or bottom-center on mobile)
  Click it and start chatting with GarfiX AI!

  🎉 That's it! You now have AI Everywhere!
*/
