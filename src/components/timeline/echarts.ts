import { CustomChart, ScatterChart } from 'echarts/charts'
import {
  BrushComponent,
  DataZoomInsideComponent,
  GridComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  CustomChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  DataZoomInsideComponent,
  BrushComponent,
  ToolboxComponent,
  CanvasRenderer,
])

export { echarts }
