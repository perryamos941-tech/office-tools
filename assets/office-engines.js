---
layout: null
---
{%- capture source -%}{% include office-base.html %}{%- endcapture -%}
{%- assign parts = source | split: 'let pdfEngine,heicConvert,pdfAssetOptions={};' -%}
{%- assign script = parts[1] | split: '</script>' -%}
let pdfEngine,heicConvert,pdfAssetOptions={};
{{ script[0] }}
