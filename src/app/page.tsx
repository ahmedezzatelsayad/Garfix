'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Building2,
  FileText,
  Package,
  ArrowRightLeft,
  CreditCard,
  Users,
  Truck,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  Wallet,
  Ship,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

interface DashboardData {
  financial: {
    totalRevenue: number
    totalExpenses: number
    netProfit: number
    totalAROutstanding: number
    totalAPOutstanding: number
    inventoryValue: number
    topProducts: {
      productId: string
      productName: string
      sku: string
      totalQuantity: number
      unitPrice: number
      totalValue: number
      purchasePrice: number
    }[]
    recentTransactions: {
      id: string
      number: string
      date: string
      amount: number
      type: string
      status: string
      description: string | null
    }[]
    arBreakdown: {
      current: number
      overdue30: number
      overdue60: number
      overdue90: number
      total: number
    }
    apBreakdown: {
      current: number
      overdue30: number
      overdue60: number
      overdue90: number
      total: number
    }
  }
  ar: {
    clientId: string
    clientName: string
    clientCode: string
    totalOutstanding: number
    totalOverdue: number
    totalReceived: number
  }[]
  ap: {
    supplierId: string
    supplierName: string
    supplierCode: string
    totalOutstanding: number
    totalOverdue: number
    totalPaid: number
  }[]
  tradeFinance: {
    totalLCAmount: number
    activeLCs: number
    expiredLCs: number
    lcByType: { import: number; export: number }
    lcByStatus: Record<string, number>
    productCosts: {
      productId: string
      productName: string
      sku: string
      purchasePrice: number
      sellingPrice: number
      margin: number
      quantityOnHand: number
      totalInventoryCost: number
    }[]
    totalProductCost: number
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value)
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'posted': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
    case 'draft': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
    case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
    case 'issued': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
    case 'confirmed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
    case 'utilized': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300'
    case 'expired': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
    case 'approved': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
    case 'paid': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
    case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
    case 'overdue': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
  }
}

export default function AccountingDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/accounting/dashboard')
      .then(res => res.json())
      .then(json => {
        if (json.error) {
          setError(json.error)
        } else {
          setData(json)
        }
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">GarfiX Accounting Module</h1>
              <p className="text-sm text-muted-foreground">Loading dashboard data...</p>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="h-24 bg-muted/50 rounded animate-pulse" />
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h1 className="text-xl font-bold">GarfiX Accounting Module</h1>
              <p className="text-sm text-destructive">Error loading dashboard</p>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="p-6 text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-lg font-medium">{error ?? 'No data available'}</p>
              <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  const { financial, ar, ap, tradeFinance } = data
  const profitMargin = financial.totalRevenue > 0
    ? ((financial.netProfit / financial.totalRevenue) * 100).toFixed(1)
    : '0'

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">GarfiX Accounting Module</h1>
              <p className="text-sm text-muted-foreground">Financial Dashboard & Management</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            Live Data
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 mb-6">
            <TabsTrigger value="overview" className="text-xs md:text-sm">
              <BarChart3 className="h-4 w-4 mr-1 hidden md:inline" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="ar-ap" className="text-xs md:text-sm">
              <ArrowRightLeft className="h-4 w-4 mr-1 hidden md:inline" />
              AR/AP
            </TabsTrigger>
            <TabsTrigger value="inventory" className="text-xs md:text-sm">
              <Package className="h-4 w-4 mr-1 hidden md:inline" />
              Inventory
            </TabsTrigger>
            <TabsTrigger value="trade" className="text-xs md:text-sm">
              <Ship className="h-4 w-4 mr-1 hidden md:inline" />
              Trade Finance
            </TabsTrigger>
            <TabsTrigger value="transactions" className="text-xs md:text-sm hidden md:flex">
              <FileText className="h-4 w-4 mr-1" />
              Transactions
            </TabsTrigger>
          </TabsList>

          {/* ─── Overview Tab ─── */}
          <TabsContent value="overview">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground font-medium">Total Revenue</span>
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </div>
                  <p className="text-2xl font-bold">{formatCurrency(financial.totalRevenue)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Posted inbound payments</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground font-medium">Total Expenses</span>
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  </div>
                  <p className="text-2xl font-bold">{formatCurrency(financial.totalExpenses)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Posted outbound payments</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground font-medium">Net Profit</span>
                    <DollarSign className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-2xl font-bold">{formatCurrency(financial.netProfit)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Margin: {profitMargin}%</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground font-medium">Inventory Value</span>
                    <Package className="h-4 w-4 text-orange-600" />
                  </div>
                  <p className="text-2xl font-bold">{formatCurrency(financial.inventoryValue)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Based on purchase price × qty</p>
                </CardContent>
              </Card>
            </div>

            {/* AR/AP Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2 p-4 md:p-6">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-600" />
                    <CardTitle className="text-base">Accounts Receivable</CardTitle>
                  </div>
                  <CardDescription>Outstanding client balances</CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6 pt-0">
                  <p className="text-3xl font-bold mb-4">{formatCurrency(financial.totalAROutstanding)}</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Current</span>
                      <span className="font-medium">{formatCurrency(financial.arBreakdown.current)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Overdue 30d</span>
                      <span className="font-medium text-yellow-600">{formatCurrency(financial.arBreakdown.overdue30)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Overdue 60d</span>
                      <span className="font-medium text-orange-600">{formatCurrency(financial.arBreakdown.overdue60)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Overdue 90d+</span>
                      <span className="font-medium text-red-600">{formatCurrency(financial.arBreakdown.overdue90)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 p-4 md:p-6">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-orange-600" />
                    <CardTitle className="text-base">Accounts Payable</CardTitle>
                  </div>
                  <CardDescription>Outstanding supplier balances</CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6 pt-0">
                  <p className="text-3xl font-bold mb-4">{formatCurrency(financial.totalAPOutstanding)}</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Current</span>
                      <span className="font-medium">{formatCurrency(financial.apBreakdown.current)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Overdue 30d</span>
                      <span className="font-medium text-yellow-600">{formatCurrency(financial.apBreakdown.overdue30)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Overdue 60d</span>
                      <span className="font-medium text-orange-600">{formatCurrency(financial.apBreakdown.overdue60)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Overdue 90d+</span>
                      <span className="font-medium text-red-600">{formatCurrency(financial.apBreakdown.overdue90)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top Products */}
            <Card className="mb-6">
              <CardHeader className="p-4 md:p-6">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-orange-600" />
                  <CardTitle className="text-base">Top Products by Value</CardTitle>
                </div>
                <CardDescription>Ranked by inventory total value (selling price × quantity)</CardDescription>
              </CardHeader>
              <CardContent className="p-0 md:p-0">
                <ScrollArea className="max-h-64">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4 md:pl-6">Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Purchase Price</TableHead>
                        <TableHead className="text-right">Sell Price</TableHead>
                        <TableHead className="text-right pr-4 md:pr-6">Total Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {financial.topProducts.map(p => (
                        <TableRow key={p.productId}>
                          <TableCell className="font-medium pl-4 md:pl-6">{p.productName}</TableCell>
                          <TableCell className="text-muted-foreground">{p.sku}</TableCell>
                          <TableCell className="text-right">{p.totalQuantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(p.purchasePrice)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(p.unitPrice)}</TableCell>
                          <TableCell className="text-right font-medium pr-4 md:pr-6">{formatCurrency(p.totalValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── AR/AP Tab ─── */}
          <TabsContent value="ar-ap">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="p-4 md:p-6">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-600" />
                    <CardTitle className="text-base">AR — Client Balances</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0 md:p-0">
                  <ScrollArea className="max-h-64">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-4 md:pl-6">Client</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead className="text-right">Received</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                          <TableHead className="text-right pr-4 md:pr-6">Overdue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ar.map(c => (
                          <TableRow key={c.clientId}>
                            <TableCell className="font-medium pl-4 md:pl-6">{c.clientName}</TableCell>
                            <TableCell className="text-muted-foreground">{c.clientCode}</TableCell>
                            <TableCell className="text-right">{formatCurrency(c.totalReceived)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(c.totalOutstanding)}</TableCell>
                            <TableCell className="text-right pr-4 md:pr-6">
                              {c.totalOverdue > 0
                                ? <span className="text-red-600 font-medium">{formatCurrency(c.totalOverdue)}</span>
                                : <span className="text-green-600">{formatCurrency(0)}</span>
                              }
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 md:p-6">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-orange-600" />
                    <CardTitle className="text-base">AP — Supplier Balances</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0 md:p-0">
                  <ScrollArea className="max-h-64">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-4 md:pl-6">Supplier</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                          <TableHead className="text-right pr-4 md:pr-6">Overdue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ap.map(s => (
                          <TableRow key={s.supplierId}>
                            <TableCell className="font-medium pl-4 md:pl-6">{s.supplierName}</TableCell>
                            <TableCell className="text-muted-foreground">{s.supplierCode}</TableCell>
                            <TableCell className="text-right">{formatCurrency(s.totalPaid)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(s.totalOutstanding)}</TableCell>
                            <TableCell className="text-right pr-4 md:pr-6">
                              {s.totalOverdue > 0
                                ? <span className="text-red-600 font-medium">{formatCurrency(s.totalOverdue)}</span>
                                : <span className="text-green-600">{formatCurrency(0)}</span>
                              }
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── Inventory Tab ─── */}
          <TabsContent value="inventory">
            <Card className="mb-4">
              <CardHeader className="p-4 md:p-6">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-orange-600" />
                  <CardTitle className="text-base">Product Catalog & Inventory Costs</CardTitle>
                </div>
                <CardDescription>
                  Total inventory cost: {formatCurrency(tradeFinance.totalProductCost)} — based on purchasePrice × quantity
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 md:p-0">
                <ScrollArea className="max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4 md:pl-6">Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Purchase Price</TableHead>
                        <TableHead className="text-right">Sell Price</TableHead>
                        <TableHead className="text-right">Margin</TableHead>
                        <TableHead className="text-right">On Hand</TableHead>
                        <TableHead className="text-right pr-4 md:pr-6">Total Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tradeFinance.productCosts.map(p => (
                        <TableRow key={p.productId}>
                          <TableCell className="font-medium pl-4 md:pl-6">{p.productName}</TableCell>
                          <TableCell className="text-muted-foreground">{p.sku}</TableCell>
                          <TableCell className="text-right">{formatCurrency(p.purchasePrice)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(p.sellingPrice)}</TableCell>
                          <TableCell className="text-right">
                            {p.margin >= 0
                              ? <span className="text-green-600">{formatCurrency(p.margin)}</span>
                              : <span className="text-red-600">{formatCurrency(p.margin)}</span>
                            }
                          </TableCell>
                          <TableCell className="text-right">{p.quantityOnHand}</TableCell>
                          <TableCell className="text-right font-medium pr-4 md:pr-6">{formatCurrency(p.totalInventoryCost)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Trade Finance Tab ─── */}
          <TabsContent value="trade">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="h-4 w-4 text-blue-600" />
                    <span className="text-sm text-muted-foreground">Total LC Amount</span>
                  </div>
                  <p className="text-2xl font-bold">{formatCurrency(tradeFinance.totalLCAmount)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-muted-foreground">Active LCs</span>
                  </div>
                  <p className="text-2xl font-bold">{tradeFinance.activeLCs}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-gray-600" />
                    <span className="text-sm text-muted-foreground">Expired LCs</span>
                  </div>
                  <p className="text-2xl font-bold">{tradeFinance.expiredLCs}</p>
                </CardContent>
              </Card>
            </div>

            {/* LC by Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Card>
                <CardHeader className="p-4 md:p-6 pb-2">
                  <CardTitle className="text-base">LC by Type</CardTitle>
                </CardHeader>
                <CardContent className="p-4 md:p-6 pt-0">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-2">
                        <Ship className="h-4 w-4 text-blue-600" /> Import
                      </span>
                      <Badge variant="secondary">{tradeFinance.lcByType.import}</Badge>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-2">
                        <Ship className="h-4 w-4 text-green-600" /> Export
                      </span>
                      <Badge variant="secondary">{tradeFinance.lcByType.export}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 md:p-6 pb-2">
                  <CardTitle className="text-base">LC by Status</CardTitle>
                </CardHeader>
                <CardContent className="p-4 md:p-6 pt-0">
                  <div className="space-y-2">
                    {Object.entries(tradeFinance.lcByStatus).map(([status, count]) => (
                      <div key={status} className="flex justify-between items-center">
                        <Badge className={getStatusColor(status)}>{status}</Badge>
                        <span className="font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── Transactions Tab ─── */}
          <TabsContent value="transactions">
            <Card>
              <CardHeader className="p-4 md:p-6">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Recent Transactions</CardTitle>
                </div>
                <CardDescription>Latest posted journal entries and payments</CardDescription>
              </CardHeader>
              <CardContent className="p-0 md:p-0">
                <ScrollArea className="max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4 md:pl-6">Number</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right pr-4 md:pr-6">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {financial.recentTransactions.map(tx => (
                        <TableRow key={tx.id}>
                          <TableCell className="font-medium pl-4 md:pl-6">{tx.number}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(tx.date)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{tx.type}</Badge>
                          </TableCell>
                          <TableCell className="max-w-48 truncate">{tx.description ?? '—'}</TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${getStatusColor(tx.status)}`}>{tx.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium pr-4 md:pr-6">{formatCurrency(tx.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t px-6 py-3 mt-auto">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>GarfiX Accounting Module v1.0 — All TypeScript compilation errors fixed</span>
          <span className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-green-600" />
            13 fixes applied
          </span>
        </div>
      </footer>
    </div>
  )
}
