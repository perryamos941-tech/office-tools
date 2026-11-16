---
layout: null
---
{%- capture source -%}{% include office-base.html %}{%- endcapture -%}
{%- assign parts = source | split: '<script id="ocr-bundles">' -%}
{%- assign script = parts[1] | split: '</script>' -%}
{{- script[0] -}}
