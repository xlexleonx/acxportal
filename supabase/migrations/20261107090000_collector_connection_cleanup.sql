-- Equipment created by a collector belongs to that collector connection.
-- Remove it before deleting the connection, while leaving manually created
-- equipment and equipment from other sources untouched.
CREATE OR REPLACE FUNCTION public.delete_collector_connection(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.collector_admin_allowed() THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;

  DELETE FROM public.equipment AS e
  USING public.collector_devices AS d
  WHERE d.collector_connection_id = _id
    AND d.equipment_id = e.id
    AND e.serial_number LIKE ('collector:' || _id::text || ':%');

  DELETE FROM public.collector_connections WHERE id = _id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Коллектор не найден';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_collector_connection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_collector_connection(uuid) TO authenticated;
