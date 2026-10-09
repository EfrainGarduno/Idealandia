-- Actualiza la opción "Idealita" del menú público a "Acerca de"
-- Se establece funcionalidad_id = NULL ya que será una vista pública estática.
-- NOTA: No se debe alterar funcionalidades.id=6 (Idealita), ya que la opción Chat la utiliza.

UPDATE menu_items
SET nombre = 'Acerca de', funcionalidad_id = NULL
WHERE nombre = 'Idealita' AND id = 14;
