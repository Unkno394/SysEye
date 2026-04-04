namespace Domain.Models.Common
{
    public interface ISoftDeleteEntity
    {
        public bool IsDeleted { get; set; }
    }
}
