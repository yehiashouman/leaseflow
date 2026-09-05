{{- define "leaseflow.name" -}}{{ .Chart.Name }}{{- end }}
{{- define "leaseflow.labels" -}}app.kubernetes.io/name: {{ include "leaseflow.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}{{- end }}
